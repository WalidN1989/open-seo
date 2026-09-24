import { createFileRoute } from "@tanstack/react-router";
import { WebsiteCallService } from "@/server/features/voice-calls/services/WebsiteCallService";

/**
 * Website voice agent (Deepgram) call log, one URL per business connection.
 * The website's server posts each finished call here, signed with the
 * connection's secret; an unsigned or mis-signed delivery is dropped before
 * its body is read.
 */
export const Route = createFileRoute("/api/voice/deepgram/$connectionId")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const result = await WebsiteCallService.processDeepgramWebhook(
          params.connectionId,
          request.headers,
          await request.text(),
        );
        return new Response(result.body, { status: result.status });
      },
    },
  },
});
