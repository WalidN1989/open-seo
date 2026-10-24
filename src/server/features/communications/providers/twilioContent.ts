import { z } from "zod";
import { resolveCredential, type WhatsappConnectionRecord } from "./whatsapp";

/**
 * WhatsApp message templates, registered through Twilio.
 *
 * A business cannot message someone out of the blue on WhatsApp: the wording
 * has to be approved by Meta first. For a Twilio-connected number that means
 * two calls — write the template here, then ask Twilio to submit it — and a
 * wait of minutes to a day for Meta's answer.
 *
 * Pure apart from `fetch`.
 */

const CONTENT_API = "https://content.twilio.com/v1";

type TemplateDraft = {
  /** Lowercase letters, numbers and underscores: Meta's rule for the name. */
  name: string;
  languageCode: string;
  body: string;
  /** A public https image shown above the words. */
  mediaUrl?: string | null;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
};

/**
 * Placeholders, as WhatsApp wants them.
 *
 * People write "Hi {{name}}"; WhatsApp only understands numbered slots, and
 * refuses a template whose slots carry no sample value — "component of type
 * BODY is missing expected field(s) (example)" is the whole of what it says.
 * So each placeholder becomes {{1}}, {{2}}… and the word inside it is kept as
 * the sample Meta reviews the wording with.
 */
export function withNumberedPlaceholders(body: string) {
  const variables: Record<string, string> = {};
  const seen = new Map<string, string>();
  const text = body.replaceAll(
    /\{\{\s*([^}]+?)\s*\}\}/g,
    (_match, label: string) => {
      const known = seen.get(label.toLowerCase());
      if (known) return `{{${known}}}`;
      const index = String(Object.keys(variables).length + 1);
      seen.set(label.toLowerCase(), index);
      // A number on its own is already a slot; anything else is a word to show.
      variables[index] = /^\d+$/.test(label)
        ? "Sample"
        : label.replaceAll(/[_-]+/g, " ");
      return `{{${index}}}`;
    },
  );
  return { text, variables };
}

/** Meta's rule for a template name, applied here so the submission is not refused. */
export function templateName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

async function call(
  connection: WhatsappConnectionRecord,
  path: string,
  body: unknown,
  fetcher: typeof fetch,
  method = "POST",
) {
  if (!connection.externalAccountId) {
    throw new Error("This WhatsApp connection has no Twilio account SID.");
  }
  const token = await resolveCredential(connection, "AUTH_TOKEN");
  const response = await fetcher(`${CONTENT_API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${btoa(`${connection.externalAccountId}:${token}`)}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = z.object({ message: z.string() }).safeParse(payload);
    throw new Error(
      message.success
        ? `Twilio said: ${message.data.message}`
        : `Twilio returned ${response.status}.`,
    );
  }
  return payload;
}

const createdSchema = z.object({ sid: z.string() });

/** Writes the template at Twilio and returns its id. */
export async function createContentTemplate(
  connection: WhatsappConnectionRecord,
  draft: TemplateDraft,
  fetcher: typeof fetch = fetch,
) {
  const { text, variables } = withNumberedPlaceholders(draft.body);
  const payload = await call(
    connection,
    "/Content",
    {
      friendly_name: templateName(draft.name),
      language: draft.languageCode || "en",
      variables,
      types: draft.mediaUrl
        ? { "twilio/media": { body: text, media: [draft.mediaUrl] } }
        : { "twilio/text": { body: text } },
    },
    fetcher,
  );
  const created = createdSchema.safeParse(payload);
  if (!created.success) throw new Error("Twilio did not return a template id.");
  return created.data.sid;
}

const approvalSchema = z.object({
  status: z.string().optional(),
  rejection_reason: z.string().optional(),
});

/** What Meta has said about a template, in this app's own words. */
type ApprovalState = {
  status: "pending" | "approved" | "rejected";
  reason: string | null;
};

function readApproval(value: unknown): ApprovalState {
  const parsed = approvalSchema.safeParse(value);
  const status = parsed.success ? (parsed.data.status ?? "") : "";
  const reason = parsed.success ? (parsed.data.rejection_reason ?? "") : "";
  return {
    status:
      status.toLowerCase() === "approved"
        ? "approved"
        : status.toLowerCase() === "rejected"
          ? "rejected"
          : "pending",
    reason: reason.trim() || null,
  };
}

/** Asks Twilio to put the template to Meta for approval. */
export async function submitForApproval(
  connection: WhatsappConnectionRecord,
  contentSid: string,
  draft: Pick<TemplateDraft, "name" | "category">,
  fetcher: typeof fetch = fetch,
): Promise<ApprovalState> {
  const payload = await call(
    connection,
    `/Content/${encodeURIComponent(contentSid)}/ApprovalRequests/whatsapp`,
    { name: templateName(draft.name), category: draft.category },
    fetcher,
  );
  return readApproval(payload);
}

/** Where a submitted template stands with Meta right now. */
export async function fetchApproval(
  connection: WhatsappConnectionRecord,
  contentSid: string,
  fetcher: typeof fetch = fetch,
): Promise<ApprovalState> {
  const payload = await call(
    connection,
    `/Content/${encodeURIComponent(contentSid)}/ApprovalRequests`,
    undefined,
    fetcher,
    "GET",
  );
  const whatsapp: unknown =
    payload && typeof payload === "object"
      ? Reflect.get(payload, "whatsapp")
      : null;
  return readApproval(whatsapp);
}

/** Fetch both the registered wording and Meta's current approval/category.
 * A SID typed into settings is not evidence that a template is approved. */
export async function fetchOrderConfirmationTemplate(
  connection: WhatsappConnectionRecord,
  contentSid: string,
  fetcher: typeof fetch = fetch,
) {
  if (!/^HX[0-9a-f]{32}$/i.test(contentSid))
    throw new Error("Invalid Twilio Content SID.");
  const content = z
    .object({
      sid: z.literal(contentSid),
      language: z.string().min(1),
      types: z.object({
        "twilio/text": z.object({ body: z.string().min(1).max(1600) }),
      }),
    })
    .parse(
      await call(
        connection,
        `/Content/${encodeURIComponent(contentSid)}`,
        undefined,
        fetcher,
        "GET",
      ),
    );
  const approval = z
    .object({
      whatsapp: z.object({ status: z.string(), category: z.string() }),
    })
    .parse(
      await call(
        connection,
        `/Content/${encodeURIComponent(contentSid)}/ApprovalRequests`,
        undefined,
        fetcher,
        "GET",
      ),
    );
  const body = content.types["twilio/text"].body;
  const slots = [...body.matchAll(/\{\{\s*([^}]+)\s*\}\}/g)].map((match) =>
    match[1].trim(),
  );
  if (
    approval.whatsapp.category.toUpperCase() !== "UTILITY" ||
    new Set(slots).size !== 3 ||
    !["1", "2", "3"].every((key) => slots.includes(key))
  )
    throw new Error(
      "Choose a utility order confirmation with slots 1 (name), 2 (order number) and 3 (total).",
    );
  return {
    body,
    languageCode: content.language,
    status: readApproval(approval.whatsapp).status,
  };
}

/** A caller-requested product link uses the approved name/link template, not a welcome. */
export async function fetchCallBookLinkTemplate(
  connection: WhatsappConnectionRecord,
  sid: string,
  fetcher: typeof fetch = fetch,
) {
  if (!/^HX[0-9a-f]{32}$/i.test(sid))
    throw new Error("Invalid Twilio Content SID.");
  const request: typeof fetch = (input, init) =>
    fetcher(input, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
  const bodyType = z.object({ body: z.string().min(1).max(1600) });
  const content = z
    .object({
      sid: z.literal(sid),
      language: z.string().min(1),
      types: z.object({
        "twilio/quick-reply": bodyType.optional(),
        "twilio/text": bodyType.optional(),
      }),
    })
    .parse(
      await call(connection, `/Content/${sid}`, undefined, request, "GET"),
    );
  const approval = z
    .object({
      whatsapp: z.object({
        status: z.string(),
        category: z.enum(["MARKETING", "UTILITY"]),
      }),
    })
    .parse(
      await call(
        connection,
        `/Content/${sid}/ApprovalRequests`,
        undefined,
        request,
        "GET",
      ),
    );
  const body =
    content.types["twilio/quick-reply"]?.body ??
    content.types["twilio/text"]?.body;
  const slots = body
    ? [...body.matchAll(/\{\{\s*([^}]+)\s*\}\}/g)].map((m) => m[1].trim())
    : [];
  if (
    !body ||
    new Set(slots).size !== 2 ||
    !slots.includes("1") ||
    !slots.includes("2")
  )
    throw new Error(
      "Choose a name/link template with slots 1 (name) and 2 (product URL).",
    );
  return {
    body,
    languageCode: content.language,
    status: readApproval(approval.whatsapp).status,
  };
}
