import { createFileRoute } from "@tanstack/react-router";
import { SocialWebhookService } from "@/server/features/social/services/SocialWebhookService";

/**
 * The one callback Meta delivers Instagram and Messenger messages to.
 *
 * Meta subscribes an app, not an account, so every connected account arrives
 * here and is routed by the id it was addressed to. Each delivery's signature
 * is checked against that account's own app secret before anything is read.
 */
export const Route = createFileRoute("/api/social/meta")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const query = new URL(request.url).searchParams;
        const challenge = await SocialWebhookService.verifyChallenge(
          query.get("hub.mode"),
          query.get("hub.verify_token"),
          query.get("hub.challenge"),
        );
        return challenge === null
          ? new Response("Verification failed", { status: 403 })
          : new Response(challenge);
      },
      POST: async ({ request }) => {
        const result = await SocialWebhookService.processWebhook(
          request.headers,
          await request.text(),
        );
        return new Response(result.body, { status: result.status });
      },
    },
  },
});
