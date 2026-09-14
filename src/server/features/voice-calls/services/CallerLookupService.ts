import { decryptCredentials } from "@/server/lib/connection-secrets";
import { initiationRequestSchema, initiationResponse } from "../callerLookup";
import { normalisePhone, timingSafeEqual } from "../elevenlabsWebhook";
import { PhoneCallRepository as Repo } from "../repositories/PhoneCallRepository";

type LookupResult = { status: number; body: unknown };

/** The header ElevenLabs is set up to send the shared secret in. */
const CALLER_LOOKUP_HEADER = "x-openseo-secret";

/**
 * Who is calling, asked by ElevenLabs as an inbound call connects. The
 * answer carries a caller's name and enquiry, so it is refused without the
 * shared secret. Once authorised it never fails: a slow or broken lookup
 * must not stop the phone being answered, so any error answers "unknown".
 */
async function lookupCaller(
  connectionId: string,
  headers: Headers,
  rawBody: string,
): Promise<LookupResult> {
  const connection = await Repo.getIntegrationById(connectionId);
  if (
    !connection ||
    connection.providerKey !== "elevenlabs" ||
    connection.status !== "connected"
  ) {
    return { status: 404, body: { error: "unknown connection" } };
  }
  const credentials = await decryptCredentials(connection.credentials);
  const secret = credentials.CALLER_LOOKUP_SECRET;
  const sent = headers.get(CALLER_LOOKUP_HEADER);
  if (!secret || !sent || !timingSafeEqual(sent, secret)) {
    return { status: 401, body: { error: "unauthorised" } };
  }

  try {
    const parsed = initiationRequestSchema.safeParse(JSON.parse(rawBody));
    const phone = parsed.success ? normalisePhone(parsed.data.caller_id) : null;
    const contact = phone
      ? await Repo.findContactByPhone(connection.organizationId, phone)
      : null;
    if (!contact) return { status: 200, body: initiationResponse(null) };
    const lead = await Repo.findOpenLead(connection.organizationId, contact.id);
    return {
      status: 200,
      body: initiationResponse({
        firstName: contact.firstName,
        email: contact.email,
        leadTitle: lead?.title ?? null,
      }),
    };
  } catch {
    return { status: 200, body: initiationResponse(null) };
  }
}

export const CallerLookupService = { lookupCaller };
