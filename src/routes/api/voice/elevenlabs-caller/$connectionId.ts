import { createFileRoute } from "@tanstack/react-router";
import { CallerLookupService } from "@/server/features/voice-calls/services/CallerLookupService";

/**
 * ElevenLabs conversation-initiation webhook: asked who is calling before an
 * inbound call starts, so a returning caller is greeted by name. One URL per
 * business connection; the shared secret header is checked first.
 */
export const Route = createFileRoute(
  "/api/voice/elevenlabs-caller/$connectionId",
)({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const result = await CallerLookupService.lookupCaller(
          params.connectionId,
          request.headers,
          await request.text(),
        );
        return Response.json(result.body, { status: result.status });
      },
    },
  },
});
