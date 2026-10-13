import { createFileRoute } from "@tanstack/react-router";
import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import { OrderShipmentService } from "@/server/features/commerce/services/OrderShipmentService";
export const Route = createFileRoute("/api/orders/$orderId/label")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        let context;
        try {
          context = await resolveUserContextFromHeaders(request.headers);
        } catch {
          return new Response("Sign in to view this label.", { status: 401 });
        }
        const url = new URL(request.url);
        const org = url.searchParams.get("organizationId");
        const shipment = url.searchParams.get("shipmentId");
        if (!org || !shipment)
          return new Response("Workspace and shipment required.", {
            status: 400,
          });
        try {
          const response = await OrderShipmentService.label(
            org,
            context.userId,
            params.orderId,
            shipment,
            url.searchParams.get("size") === "4X6" ? "4X6" : "A4",
          );
          return new Response(response.body, {
            headers: {
              "content-type": "application/pdf",
              "cache-control": "private, no-store",
              "x-content-type-options": "nosniff",
              "x-robots-tag": "noindex",
            },
          });
        } catch {
          return new Response("Label unavailable in this workspace.", {
            status: 404,
          });
        }
      },
    },
  },
});
