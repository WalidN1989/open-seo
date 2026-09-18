import { decryptCredentials } from "@/server/lib/connection-secrets";
import {
  analyseWebsiteCall,
  readWebsiteCall,
  websiteCallReport,
} from "../deepgramWebhook";
import { verifyElevenLabsSignature } from "../elevenlabsWebhook";
import { PhoneCallRepository as Repo } from "../repositories/PhoneCallRepository";
import { resolveAnthropicKey } from "./CallRecapService";
import { PhoneCallService, type WebhookResult } from "./PhoneCallService";

/** A website delivery carries a whole transcript; anything larger is refused. */
const MAX_WEBSITE_BODY = 512 * 1024;

/**
 * The website posts here when a call to its Deepgram voice agent ends. Same
 * shape of check as ElevenLabs: the connection id picks the business and its
 * secret, and nothing is read before the signature checks out. The model
 * then reads the transcript for what ElevenLabs would have captured.
 */
async function processDeepgramWebhook(
  connectionId: string,
  headers: Headers,
  rawBody: string,
): Promise<WebhookResult> {
  if (rawBody.length > MAX_WEBSITE_BODY) {
    return { status: 413, body: "too large" };
  }
  const connection = await Repo.getIntegrationById(connectionId);
  if (
    !connection ||
    connection.providerKey !== "deepgram" ||
    connection.status !== "connected"
  ) {
    return { status: 404, body: "unknown connection" };
  }
  const credentials = await decryptCredentials(connection.credentials);
  const secret = credentials.WEBHOOK_SECRET;
  if (!secret) return { status: 410, body: "connection has no webhook secret" };
  // The website signs the way ElevenLabs does, under its own header name.
  const valid = await verifyElevenLabsSignature({
    secret,
    header: headers.get("x-openseo-signature"),
    rawBody,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!valid) return { status: 401, body: "bad signature" };

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: "unreadable body" };
  }
  const call = readWebsiteCall(payload);
  if (!call) return { status: 400, body: "not a website call" };
  // Checked before the model reads the call, so a retry costs nothing.
  if (await Repo.findCall(connection.organizationId, call.callId)) {
    return { status: 200, body: "duplicate" };
  }

  const analysis = await analyseWebsiteCall(
    call,
    await resolveAnthropicKey(connection.organizationId),
  );
  const { region, ...report } = websiteCallReport(call, analysis);
  const result = await PhoneCallService.recordCall(
    {
      provider: "deepgram",
      organizationId: connection.organizationId,
      integrationId: connection.id,
      welcomeTemplate: credentials.WELCOME_TEMPLATE,
      region,
    },
    report,
  );
  return { status: 200, body: result.duplicate ? "duplicate" : "recorded" };
}

export const WebsiteCallService = { processDeepgramWebhook };
