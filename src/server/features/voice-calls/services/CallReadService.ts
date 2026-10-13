import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { resolveConnectionCredential } from "@/server/lib/connection-secrets";
import { PhoneCallRepository } from "../repositories/PhoneCallRepository";
import { PhoneCallService } from "./PhoneCallService";

async function recordingConnection(organizationId: string, callId: string) {
  const [row] = await PhoneCallRepository.listCalls(organizationId, 1, {
    callId,
  });
  if (!row || row.call.provider !== "elevenlabs" || !row.call.integrationId)
    return null;
  const connection = await PhoneCallRepository.getIntegrationById(
    row.call.integrationId,
  );
  if (
    !connection ||
    connection.organizationId !== organizationId ||
    connection.providerKey !== "elevenlabs" ||
    connection.status !== "connected"
  )
    return null;
  return { connection, conversationId: row.call.externalConversationId };
}

async function providerRequest(
  recording: NonNullable<Awaited<ReturnType<typeof recordingConnection>>>,
  audio = false,
  apiKey?: string,
) {
  const key =
    apiKey ??
    (await resolveConnectionCredential(recording.connection, "API_KEY"));
  return fetch(
    `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(recording.conversationId)}${audio ? "/audio" : ""}`,
    {
      headers: { "xi-api-key": key },
      redirect: "manual",
      signal: AbortSignal.timeout(audio ? 30_000 : 5_000),
    },
  );
}

async function recordingInfo(
  organizationId: string,
  callId: string,
  baseUrl: string,
) {
  try {
    const recording = await recordingConnection(organizationId, callId);
    if (!recording)
      return { recordingUrl: null, recordingStatus: "unavailable" };
    let apiKey: string;
    try {
      apiKey = await resolveConnectionCredential(
        recording.connection,
        "API_KEY",
      );
    } catch {
      return { recordingUrl: null, recordingStatus: "credentials_missing" };
    }
    const response = await providerRequest(recording, false, apiKey);
    if (!response.ok)
      return { recordingUrl: null, recordingStatus: "unavailable" };
    const metadata = z
      .object({ has_audio: z.boolean() })
      .parse(await response.json());
    return metadata.has_audio
      ? {
          recordingUrl: `${baseUrl}/api/voice/calls/${encodeURIComponent(callId)}/recording?organizationId=${encodeURIComponent(organizationId)}`,
          recordingStatus: "available",
        }
      : { recordingUrl: null, recordingStatus: "not_recorded" };
  } catch {
    return { recordingUrl: null, recordingStatus: "unavailable" };
  }
}

async function list(
  organizationId: string,
  userId: string,
  baseUrl: string,
  options: { sinceHours?: number; limit?: number },
) {
  const rows = await PhoneCallService.listCalls(organizationId, userId, {
    limit: options.limit ?? 20,
    since:
      options.sinceHours === undefined
        ? undefined
        : new Date(Date.now() - options.sinceHours * 3_600_000).toISOString(),
  });
  // Bound provider concurrency while leaving transcripts available if audio lookup fails.
  const calls = [];
  for (let index = 0; index < rows.length; index += 10) {
    calls.push(
      ...(await Promise.all(
        rows.slice(index, index + 10).map(async (call) => ({
          ...call,
          organizationId,
          timezone: "UTC",
          outcome: call.callSuccessful,
          ...(await recordingInfo(organizationId, call.id, baseUrl)),
        })),
      )),
    );
  }
  return calls;
}

async function detail(
  organizationId: string,
  userId: string,
  callId: string,
  baseUrl: string,
) {
  const [call] = await PhoneCallService.listCalls(organizationId, userId, {
    callId,
    limit: 1,
  });
  if (!call)
    throw new AppError("NOT_FOUND", "Call not found in this workspace.");
  return {
    ...call,
    organizationId,
    timezone: "UTC",
    outcome: call.callSuccessful,
    ...(await recordingInfo(organizationId, call.id, baseUrl)),
  };
}

async function openRecording(
  organizationId: string,
  userId: string,
  callId: string,
) {
  // Recheck membership/module access on every playback, before touching credentials.
  const [call] = await PhoneCallService.listCalls(organizationId, userId, {
    callId,
    limit: 1,
  });
  if (!call) throw new AppError("NOT_FOUND");
  const source = await recordingConnection(organizationId, callId);
  if (!source) throw new AppError("NOT_FOUND");
  const response = await providerRequest(source, true);
  if (!response.ok) throw new AppError("NOT_FOUND", "Recording unavailable.");
  return response;
}

export const CallReadService = { list, detail, recording: openRecording };
