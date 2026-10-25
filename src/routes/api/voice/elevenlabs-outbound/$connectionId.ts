import { createFileRoute } from "@tanstack/react-router";
import { PhoneCallService } from "@/server/features/voice-calls/services/PhoneCallService";

export const Route = createFileRoute(
  "/api/voice/elevenlabs-outbound/$connectionId",
)({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const result = await PhoneCallService.processElevenLabsWebhook(
          params.connectionId,
          request.headers,
          await request.text(),
          true,
        );
        return new Response(result.body, { status: result.status });
      },
    },
  },
});
