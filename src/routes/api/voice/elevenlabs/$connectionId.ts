import { createFileRoute } from "@tanstack/react-router";
import { PhoneCallService } from "@/server/features/voice-calls/services/PhoneCallService";

/**
 * ElevenLabs post-call webhook, one URL per business connection. The
 * connection id selects the webhook secret; a delivery that does not verify
 * against it is dropped before its body is read.
 */
export const Route = createFileRoute("/api/voice/elevenlabs/$connectionId")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const result = await PhoneCallService.processElevenLabsWebhook(
          params.connectionId,
          request.headers,
          await request.text(),
        );
        return new Response(result.body, { status: result.status });
      },
    },
  },
});
