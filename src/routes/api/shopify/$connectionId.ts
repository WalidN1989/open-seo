import { readWebhookBody } from "@/server/features/commerce/providers/shopifyWebhookBody";
import { createFileRoute } from "@tanstack/react-router";
import { ShopifyOrderService } from "@/server/features/commerce/services/ShopifyOrderService";

export const Route = createFileRoute("/api/shopify/$connectionId")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const size = Number(request.headers.get("content-length"));
        if (size > 2_000_000) return new Response(null, { status: 413 });
        try {
          const body = await readWebhookBody(request);
          if (body === null) return new Response(null, { status: 413 });
          const status = await ShopifyOrderService.webhook(
            params.connectionId,
            request.headers,
            body,
          );
          return new Response(null, { status });
        } catch {
          // Never return provider payloads or credential-bearing errors publicly.
          return new Response(null, { status: 503 });
        }
      },
    },
  },
});
