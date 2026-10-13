import { createFileRoute } from "@tanstack/react-router";
import { readWebhookBody } from "@/server/features/commerce/providers/shopifyWebhookBody";
import { OrderShipmentService } from "@/server/features/commerce/services/OrderShipmentService";
export const Route = createFileRoute("/api/citypak/$connectionId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const body = await readWebhookBody(request);
          if (body === null) return new Response(null, { status: 413 });
          let payload: unknown;
          try {
            payload = JSON.parse(body);
          } catch {
            return new Response(null, { status: 400 });
          }
          const status = await OrderShipmentService.callback(
            params.connectionId,
            request.headers.get("x-citypak-secret"),
            payload,
          );
          return new Response(null, { status });
        } catch {
          return new Response(null, { status: 503 });
        }
      },
    },
  },
});
