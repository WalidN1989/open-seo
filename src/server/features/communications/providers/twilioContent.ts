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
  const payload = await call(
    connection,
    "/Content",
    {
      friendly_name: templateName(draft.name),
      language: draft.languageCode || "en",
      variables: {},
      types: draft.mediaUrl
        ? { "twilio/media": { body: draft.body, media: [draft.mediaUrl] } }
        : { "twilio/text": { body: draft.body } },
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
