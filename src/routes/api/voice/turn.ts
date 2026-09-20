import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import {
  streamVoiceTurn,
  type VoiceTurnEvent,
} from "@/server/features/voice/services/VoiceTurnStream";

/**
 * One spoken turn, streamed back sentence by sentence.
 *
 * A server function can only answer once, which meant waiting for the whole
 * reply to be written and spoken before the person heard a word. This sends
 * each sentence's audio the moment it exists.
 *
 * The signed-in session is the credential, and the turn is answered inside
 * that person's own workspace — the same check every voice server function
 * makes.
 */

const turnSchema = z.object({
  conversationId: z.string().min(1),
  audioBase64: z.string().min(1),
  mimeType: z.string().min(1).max(120),
  language: z.string().min(2).max(20).optional(),
});

function line(event: VoiceTurnEvent) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export const Route = createFileRoute("/api/voice/turn")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const context = await resolveUserContextFromHeaders(
          request.headers,
        ).catch(() => null);
        if (!context?.userId || !context.organizationId) {
          return new Response("Sign in to use the voice agent.", {
            status: 401,
          });
        }
        const parsed = turnSchema.safeParse(await request.json());
        if (!parsed.success) {
          return new Response("That turn could not be read.", { status: 400 });
        }
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            try {
              for await (const event of streamVoiceTurn({
                organizationId: context.organizationId,
                userId: context.userId,
                ...parsed.data,
              })) {
                controller.enqueue(encoder.encode(line(event)));
              }
            } catch (error) {
              // The reason reaches the panel instead of the stream simply
              // stopping with nothing said.
              controller.enqueue(
                encoder.encode(
                  line({
                    type: "error",
                    message:
                      error instanceof Error
                        ? error.message
                        : "The voice agent could not respond.",
                  }),
                ),
              );
            } finally {
              controller.close();
            }
          },
        });
        return new Response(stream, {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-store",
            connection: "keep-alive",
            // Nothing between here and the browser may hold the sentences
            // back waiting for the end.
            "x-accel-buffering": "no",
          },
        });
      },
    },
  },
});
