import { createFileRoute } from "@tanstack/react-router";
import { PhoneCallRepository } from "@/server/features/voice-calls/repositories/PhoneCallRepository";
import { verifyVoiceRecordingToken } from "@/server/features/voice-calls/recordingLink";
import { decryptCredentials } from "@/server/lib/connection-secrets";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";

export const Route = createFileRoute("/api/voice/calls/$callId/recording")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const token = new URL(request.url).searchParams.get("t") ?? "";
        const claims = token
          ? await verifyVoiceRecordingToken(
              token,
              await getRequiredEnvValue("BETTER_AUTH_SECRET"),
            )
          : null;
        if (!claims || claims.callId !== params.callId)
          return new Response(
            "This recording link has expired or is invalid.",
            { status: 404 },
          );
        const row = await PhoneCallRepository.getCall(
          claims.organizationId,
          claims.callId,
        );
        if (
          !row ||
          row.call.provider !== "elevenlabs" ||
          !row.call.integrationId
        )
          return new Response("Recording not available.", { status: 404 });
        const integration = await PhoneCallRepository.getIntegrationById(
          row.call.integrationId,
        );
        if (
          !integration ||
          integration.organizationId !== claims.organizationId
        )
          return new Response("Recording not available.", { status: 404 });
        const credentials = await decryptCredentials(integration.credentials);
        if (!credentials.API_KEY)
          return new Response("Recording access is not configured.", {
            status: 404,
          });
        const upstream = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(row.call.externalConversationId)}/audio`,
          { headers: { "xi-api-key": credentials.API_KEY } },
        );
        if (!upstream.ok || !upstream.body)
          return new Response("Recording not available.", { status: 404 });
        return new Response(upstream.body, {
          status: 200,
          headers: {
            "content-type":
              upstream.headers.get("content-type") ?? "audio/mpeg",
            "cache-control": "private, no-store",
            "content-disposition": `inline; filename="voice-call-${params.callId}.mp3"`,
            "x-robots-tag": "noindex",
          },
        });
      },
    },
  },
});
