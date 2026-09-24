import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { speakWithDeepgram } from "@/server/features/communications/providers/voice";
import { BusinessSettingsRepository } from "@/server/features/business-modules/repositories/BusinessSettingsRepository";
import { CommunicationsRepository } from "@/server/features/communications/repositories/CommunicationsRepository";
import { greetingName, greetingText } from "../greeting";

/**
 * Spoken greetings, kept once made. The same person hears the same line every
 * time they open the voice, so it is synthesised once rather than on every
 * click — which is what lets the greeting play the instant the orb is tapped.
 */
const GREETING_TTL_MS = 60 * 60_000;
const spoken = new Map<
  string,
  { at: number; text: string; audioBase64: string; mimeType: string }
>();

/**
 * The name the voice uses for whoever is speaking in this workspace: the one
 * set for the business, or else the login's name when it reads as a person's.
 */
async function speakerName(organizationId: string, userId: string) {
  const [settings, user, organizations] = await Promise.all([
    BusinessSettingsRepository.getOrCreate(organizationId),
    AuthRepository.getHostedUser(userId),
    AuthRepository.listOrganizationsForUser(userId),
  ]);
  const set = settings?.voiceName?.trim();
  if (set) return set;
  return greetingName(
    user?.name,
    organizations.map((row) => row.name),
  );
}

async function getVoiceName(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, "voice");
  const settings = await BusinessSettingsRepository.getOrCreate(organizationId);
  return { voiceName: settings?.voiceName ?? "" };
}

async function setVoiceName(
  organizationId: string,
  userId: string,
  input: { voiceName: string },
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "voice",
    "manage",
  );
  const voiceName = input.voiceName.trim() || null;
  await BusinessSettingsRepository.setVoiceName(organizationId, voiceName);
  // Greetings made with the old name are dropped for this workspace.
  for (const key of spoken.keys()) {
    if (key.startsWith(`${organizationId}:`)) spoken.delete(key);
  }
  return { voiceName: voiceName ?? "" };
}

async function greeting(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "voice",
    "manage",
  );
  const key = `${organizationId}:${userId}`;
  const kept = spoken.get(key);
  if (kept && Date.now() - kept.at < GREETING_TTL_MS) {
    return {
      text: kept.text,
      audioBase64: kept.audioBase64,
      mimeType: kept.mimeType,
    };
  }
  const [name, workspace] = await Promise.all([
    speakerName(organizationId, userId),
    CommunicationsRepository.getVoiceWorkspace(organizationId),
  ]);
  const text = greetingText(name);
  // The launcher talks through the newest agent, or creates one on this key.
  const credential =
    workspace.agents[0]?.credentialReference ?? "OPENSEO_VOICE";
  const audio = await speakWithDeepgram(credential, text);
  if (spoken.size > 500) spoken.clear();
  spoken.set(key, { at: Date.now(), text, ...audio });
  return { text, ...audio };
}

export const VoiceGreetingService = {
  greeting,
  speakerName,
  getVoiceName,
  setVoiceName,
} as const;
