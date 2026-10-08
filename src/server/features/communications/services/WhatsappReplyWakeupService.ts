import {
  getOptionalEnvValue,
  getRequiredEnvValue,
} from "@/server/lib/runtime-env";
import { type ReplyWakeup } from "@/shared/whatsapp-reply-wakeup";

/** Notify the container clock only when a real inbound message queues a reply. */
export async function wakeWhatsappReply(job: ReplyWakeup) {
  const runnerUrl = await getOptionalEnvValue("WHATSAPP_REPLY_RUNNER_URL");
  // Cloudflare deployments retain their platform scheduler; no local process there.
  if (!runnerUrl) return;
  const secret = await getRequiredEnvValue("INTERNAL_CRON_SECRET");
  const response = await fetch(`${runnerUrl}/schedule`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-cron-secret": secret,
    },
    body: JSON.stringify(job),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("WhatsApp reply runner unavailable");
}
