import { createFileRoute } from "@tanstack/react-router";
import { VoiceCustomerQueryService } from "@/server/features/voice-calls/services/VoiceCustomerQueryService";

export const Route = createFileRoute(
  "/api/voice/elevenlabs-query/$connectionId",
)({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const result = await VoiceCustomerQueryService.query(
          params.connectionId,
          request.headers,
          await request.text(),
        );
        return Response.json(result.body, { status: result.status });
      },
    },
  },
});
