import { EmailRepository } from "@/server/features/email/repositories/EmailRepository";
import { EmailSendService } from "@/server/features/email/services/EmailSendService";
import { CommunicationsRepository } from "@/server/features/communications/repositories/CommunicationsRepository";
import { resolveAiKey } from "@/server/features/communications/services/WhatsappAssistantService";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { draftRecap, withSignature } from "../callRecap";
import type { PhoneCallReport } from "../elevenlabsWebhook";

/** Marks the recap as the app's own writing in the Email module. */
const AUTHOR = "assistant:voice-recap";

/**
 * The business's own Anthropic key when its Claude connection is live,
 * otherwise the platform's, otherwise null.
 */
export async function resolveAnthropicKey(organizationId: string) {
  const aiConnection = await CommunicationsRepository.getIntegrationByProvider(
    organizationId,
    "claude_haiku",
  );
  return (
    (aiConnection?.status === "connected"
      ? await resolveAiKey(aiConnection)
      : null) ??
    (await getOptionalEnvValue("ANTHROPIC_API_KEY")) ??
    null
  );
}

/**
 * Email the caller a recap of their call from the business's connected
 * mailbox, so their reply lands in the Email module next to it. Returns what
 * happened, for the call record; it never throws, because the call is
 * already saved and a failed email must not make ElevenLabs retry it.
 */
async function sendCallRecap(input: {
  organizationId: string;
  email: string | null;
  firstName: string;
  report: PhoneCallReport;
}): Promise<string> {
  if (!input.email) return "skipped: no email captured";
  try {
    const account = await EmailRepository.getAccount(input.organizationId);
    if (account?.status !== "connected") {
      return "skipped: no connected mailbox";
    }
    const businessName = account.displayName?.trim() || "our";
    const apiKey = await resolveAnthropicKey(input.organizationId);
    const draftInput = {
      report: input.report,
      firstName: input.firstName,
      businessName,
    };
    let { recap, drafted } = await draftRecap(draftInput, apiKey);
    // The tenant key can be revoked while the platform key still works.
    const platformKey = await getOptionalEnvValue("ANTHROPIC_API_KEY");
    if (drafted === "plain" && platformKey && platformKey !== apiKey) {
      ({ recap, drafted } = await draftRecap(draftInput, platformKey));
    }
    const sent = await EmailSendService.sendFromConnectedMailbox(
      input.organizationId,
      {
        to: input.email,
        subject: recap.subject,
        text: withSignature(recap.body, businessName),
        authoredBy: AUTHOR,
      },
    );
    return sent ? `sent (${drafted})` : "skipped: no connected mailbox";
  } catch (error) {
    return `failed: ${error instanceof Error ? error.message : "unknown error"}`.slice(
      0,
      300,
    );
  }
}

export const CallRecapService = { sendCallRecap };
