import { createFileRoute } from "@tanstack/react-router";
import { EmailWebhookService } from "@/server/features/email/services/EmailWebhookService";

/**
 * AgentMail delivers here, one URL per account, signed with that account's
 * own webhook secret. The account id in the path selects the secret; a
 * payload that does not verify against it is dropped before parsing.
 */
export const Route = createFileRoute("/api/email/$accountId")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const result = await EmailWebhookService.processWebhook(
          params.accountId,
          request.headers,
          await request.text(),
        );
        return new Response(result.body, { status: result.status });
      },
    },
  },
});
