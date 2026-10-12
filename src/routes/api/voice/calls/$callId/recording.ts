import { createFileRoute } from "@tanstack/react-router";
import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import { CallReadService } from "@/server/features/voice-calls/services/CallReadService";

export const Route = createFileRoute("/api/voice/calls/$callId/recording")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        let context;
        try {
          context = await resolveUserContextFromHeaders(request.headers);
        } catch {
          return new Response("Sign in to listen to this recording.", {
            status: 401,
          });
        }
        const organizationId = new URL(request.url).searchParams.get(
          "organizationId",
        );
        if (!organizationId)
          return new Response("Workspace is required.", { status: 400 });
        try {
          const response = await CallReadService.recording(
            organizationId,
            context.userId,
            params.callId,
          );
          return new Response(response.body, {
            headers: {
              "content-type": "audio/mpeg",
              "cache-control": "private, no-store",
              "x-content-type-options": "nosniff",
              "x-robots-tag": "noindex",
            },
          });
        } catch {
          return new Response("Recording unavailable in this workspace.", {
            status: 404,
          });
        }
      },
    },
  },
});
