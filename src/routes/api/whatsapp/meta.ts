import { createFileRoute } from "@tanstack/react-router";
import { CommunicationsService } from "@/server/features/communications/services/CommunicationsService";

/**
 * The stable callback for the shared platform Meta app.
 *
 * One app subscribes one URL, and every tenant's numbers arrive here. Nothing
 * in the path identifies a tenant: the signature is verified against the
 * platform app secret and the organization is derived from the connection the
 * payload's own phone_number_id resolves to.
 */
export const Route = createFileRoute("/api/whatsapp/meta")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const query = new URL(request.url).searchParams;
        const challenge = await CommunicationsService.verifyMetaWebhook(
          query.get("hub.mode"),
          query.get("hub.verify_token"),
          query.get("hub.challenge"),
        );
        return challenge === null
          ? new Response("Verification failed", { status: 403 })
          : new Response(challenge);
      },
      POST: async ({ request }) => {
        const result = await CommunicationsService.processMetaWebhook(
          await request.text(),
          request.headers,
        );
        return new Response(result.body, { status: result.status });
      },
    },
  },
});
