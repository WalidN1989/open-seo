import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import {
  PhoneCallRepository as Repo,
  type CallReadOptions,
} from "../repositories/PhoneCallRepository";
import type { PhoneCallReport } from "../elevenlabsWebhook";
export async function listCalls(
  organizationId: string,
  userId: string,
  options: CallReadOptions = {},
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "voice");
  const rows = await Repo.listCalls(
    organizationId,
    options.limit ?? 100,
    options,
  );
  return rows.map(({ call, contact, lead, bookLinkMessage, caseLink }) => ({
    id: call.id,
    provider: call.provider,
    agentName: call.agentName,
    direction: call.direction,
    externalConversationId: call.externalConversationId,
    caseId: caseLink?.caseId ?? null,
    calleeName:
      call.direction === "outbound" && contact
        ? [contact.firstName, contact.lastName].filter(Boolean).join(" ")
        : null,
    storedRecordingUrl: call.recordingUrl,
    callerNumber: call.callerNumber,
    calledNumber: call.calledNumber,
    startedAt: call.startedAt ?? call.createdAt,
    durationSeconds: call.durationSeconds,
    summary: call.summary,
    callSuccessful: call.callSuccessful,
    captured: capturedFrom(call.capturedJson),
    transcript: transcriptFrom(call.transcriptJson),
    welcomeStatus: call.welcomeStatus,
    bookLinkStatus: bookLinkMessage?.status ?? call.bookLinkStatus,
    bookLinkAttempted: Boolean(bookLinkMessage),
    recapEmailStatus: call.recapEmailStatus,
    contact: contact
      ? {
          id: contact.id,
          name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
        }
      : null,
    lead: lead ? { id: lead.id, title: lead.title, status: lead.status } : null,
  }));
}

function capturedFrom(json: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function transcriptFrom(json: string): PhoneCallReport["transcript"] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((turn: unknown) => {
      if (!turn || typeof turn !== "object") return [];
      const role = "role" in turn ? turn.role : null;
      const message = "message" in turn ? turn.message : null;
      const atSeconds = "atSeconds" in turn ? turn.atSeconds : null;
      if (typeof role !== "string" || typeof message !== "string") return [];
      return [
        {
          role,
          message,
          atSeconds: typeof atSeconds === "number" ? atSeconds : null,
        },
      ];
    });
  } catch {
    return [];
  }
}
