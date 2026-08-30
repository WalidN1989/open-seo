import { createFileRoute } from "@tanstack/react-router";
import { CommunicationsService } from "@/server/features/communications/services/CommunicationsService";

export const Route = createFileRoute("/api/whatsapp/$connectionId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const query = new URL(request.url).searchParams;
        const challenge = await CommunicationsService.verifyMetaWebhook(
          params.connectionId,
          query.get("hub.mode"),
          query.get("hub.verify_token"),
          query.get("hub.challenge"),
        );
        return challenge === null
          ? new Response("Verification failed", { status: 403 })
          : new Response(challenge);
      },
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
