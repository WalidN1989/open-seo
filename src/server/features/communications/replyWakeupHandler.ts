import { WhatsappHandoffOutboxRepository } from "./repositories/WhatsappHandoffOutboxRepository";
import { WhatsappHandoffService } from "./services/WhatsappHandoffService";
import { z } from "zod";
import { authorizedByInternalSecret } from "@/server/lib/internal-secret";
import { WhatsappReplyJobRepository as Jobs } from "./repositories/WhatsappReplyJobRepository";
import { runDueWhatsappReplies } from "./services/WhatsappReplyJobService";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("recover") }),
  z.object({
    action: z.literal("run"),
    conversationId: z.string().min(1).max(200),
  }),
]);

export async function handleWhatsappReplyWakeup(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  if (!(await authorizedByInternalSecret(request)))
    return new Response("Unauthorized", { status: 401 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Invalid action" }, { status: 400 });
  if (parsed.data.action === "recover") {
    return Response.json(await pendingWakeups());
  }
  await runDueWhatsappReplies(parsed.data.conversationId);
  await WhatsappHandoffService.runDue(parsed.data.conversationId);
  return Response.json(await pendingWakeups(parsed.data.conversationId));
}

async function pendingWakeups(conversationId?: string) {
  const [replies, handoffs] = await Promise.all([
    Jobs.pendingWakeups(conversationId),
    WhatsappHandoffOutboxRepository.pendingWakeups(conversationId),
  ]);
  // Request-local and bounded by the two repository limits; no long-lived cache.
  const earliest = new Map<string, (typeof replies)[number]>();
  for (const job of [...replies, ...handoffs]) {
    const current = earliest.get(job.conversationId);
    if (!current || job.dueAt < current.dueAt)
      earliest.set(job.conversationId, job);
  }
  return [...earliest.values()];
}
