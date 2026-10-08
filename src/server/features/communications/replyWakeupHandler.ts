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
  if (parsed.data.action === "recover")
    return Response.json(await Jobs.pendingWakeups());
  await runDueWhatsappReplies(parsed.data.conversationId);
  return Response.json(await Jobs.pendingWakeups(parsed.data.conversationId));
}
