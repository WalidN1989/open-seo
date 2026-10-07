import { signToken, verifyToken } from "@/server/lib/signed-token";

export const VOICE_RECORDING_LINK_TTL_MS = 15 * 60 * 1000;
type Claims = { callId: string; organizationId: string; expiresAt: number };
function isClaims(value: unknown): value is Claims {
  return Boolean(
    value &&
    typeof value === "object" &&
    "callId" in value &&
    typeof value.callId === "string" &&
    "organizationId" in value &&
    typeof value.organizationId === "string" &&
    "expiresAt" in value &&
    typeof value.expiresAt === "number",
  );
}
export const signVoiceRecordingToken = (claims: Claims, secret: string) =>
  signToken(claims, secret);
export async function verifyVoiceRecordingToken(
  token: string,
  secret: string,
  now = Date.now(),
) {
  const claims = await verifyToken(token, secret, isClaims);
  return claims && claims.expiresAt > now ? claims : null;
}
export function voiceRecordingPath(callId: string, token: string) {
  return `/api/voice/calls/${encodeURIComponent(callId)}/recording?t=${encodeURIComponent(token)}`;
}
