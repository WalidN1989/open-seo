import { createFileRoute } from "@tanstack/react-router";
import { CommunicationsService } from "@/server/features/communications/services/CommunicationsService";

/**
 * The per-connection callback.
 *
 * Twilio keeps this permanently: its signature covers the URL and is computed
 * with the account's own token, so the connection must be resolved before
 * verification is possible.
 *
 * Meta keeps it only for the migration. Deliveries arriving here are routed by
 * the payload's phone_number_id exactly as they are on the stable endpoint;
 * the connection id in the path is compared against what resolved and the
 * disagreement is recorded, never acted on. It is retired once the log is
 * quiet. The GET verification is gone — one shared app verifies once, at the
 * stable callback — so a stale subscription fails loudly rather than silently
 * verifying against a tenant's own token.
 */
export const Route = createFileRoute("/api/whatsapp/$connectionId")({
  server: {
    handlers: {
      GET: () =>
        new Response(
          "This callback no longer verifies. Subscribe the shared Meta app to /api/whatsapp/meta.",
          { status: 410 },
        ),
      POST: async ({ params, request }) => {
        const result = await CommunicationsService.processWhatsappWebhook(
          params.connectionId,
          request.url,
          request.headers,
          await request.text(),
        );
        return new Response(result.body, { status: result.status });
      },
    },
  },
});
