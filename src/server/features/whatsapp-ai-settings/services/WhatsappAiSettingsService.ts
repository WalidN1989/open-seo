import { whatsappWritingSnapshot } from "@/shared/whatsapp-ai-configuration";
import type { z } from "zod";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { WhatsappAssistantRepository } from "@/server/features/communications/repositories/WhatsappAssistantRepository";
import { WhatsappAssistantService } from "@/server/features/communications/services/WhatsappAssistantService";
import { AppError } from "@/server/lib/errors";
import { WhatsappAiSettingsRepository as Repo } from "../repositories/WhatsappAiSettingsRepository";
import {
  whatsappAiTextSchema,
  whatsappAiVersionSchema,
  updateWhatsappAiSettingsSchema,
  restoreWhatsappAiSettingsSchema,
  type WhatsappAiText,
} from "@/types/schemas/whatsappAiSettings";

async function revision(text: WhatsappAiText) {
  const bytes = new TextEncoder().encode(JSON.stringify(text));
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function authorize(organizationId: string, userId: string) {
  // Deliberately do not use requireAssistantAccess: Email/Social access is not
  // permission to expose or edit these fields through the WhatsApp MCP surface.
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "manage",
  );
  const workspace = await Repo.workspace(organizationId);
  if (!workspace) throw new AppError("NOT_FOUND", "Workspace not found.");
  return workspace;
}

async function current(organizationId: string) {
  const row = await WhatsappAssistantRepository.getSettings(organizationId);
  return {
    row,
    text: whatsappWritingSnapshot(row),
  };
}

function parseVersion(metadataJson: string) {
  const data: unknown = JSON.parse(metadataJson);
  return whatsappAiVersionSchema.parse(data);
}

async function get(organizationId: string, userId: string) {
  const workspace = await authorize(organizationId, userId);
  const { row, text } = await current(organizationId);
  const effective = WhatsappAssistantService.withDefaults(row);
  return {
    workspace,
    revision: await revision(text),
    ...text,
    businessFacts: effective.businessFacts,
    effectiveHandoffMessage: effective.handoffMessage,
    effectiveInstructions: effective.persona,
    effectiveReplyStyle: effective.replyStyle,
    effectiveResponseMessages: effective.responseMessages,
    fixedHandoffMessageEditable: true,
    handoffContentSid: effective.handoffContentSid,
    escalationKeywords: effective.escalationKeywords,
    autopilot: effective.autopilot,
    workspaceReplyMode: effective.autopilot ? "auto" : "manual",
    newChatReplyMode: "auto",
    scopeNote:
      "Instructions/persona and handoff text are shared with Email/Social. Writing style and canned messages are WhatsApp-specific. All effective defaults are returned and editable; protocol, factual grounding, access and send protections remain enforced. Workspace autopilot gates auto-replies; each chat has its own Auto/Manual mode (new chats default to Auto).",
  };
}

async function save(
  organizationId: string,
  userId: string,
  workspace: { id: string; name: string },
  change: {
    before: WhatsappAiText;
    after: WhatsappAiText;
    operation: "update" | "restore";
    expectedResponseMessagesJson: string | null;
  },
) {
  const { before, after, operation, expectedResponseMessagesJson } = change;
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return {
      workspace,
      changed: false,
      versionId: null,
      revision: await revision(before),
      before,
      after,
    };
  }
  const event = await Repo.change({
    organizationId,
    actorUserId: userId,
    before,
    after,
    operation,
    expectedResponseMessagesJson,
  }).catch(() => {
    // Database errors may include SQL parameters containing private prompt text.
    // Do not send those parameters to MCP telemetry or the assistant.
    throw new AppError(
      "INTERNAL_ERROR",
      "Could not confirm the settings change. Read settings and history before retrying.",
    );
  });
  if (!event)
    throw new AppError(
      "CONFLICT",
      "Settings changed while saving. Read get_whatsapp_ai_settings again before retrying.",
    );
  return {
    workspace,
    changed: true,
    versionId: event.id,
    revision: await revision(after),
    before,
    after,
  };
}

function checkRevision(expected: string, actual: string) {
  if (expected !== actual)
    throw new AppError(
      "CONFLICT",
      "Settings changed. Read get_whatsapp_ai_settings again before retrying.",
    );
}

async function update(
  organizationId: string,
  userId: string,
  input: z.infer<typeof updateWhatsappAiSettingsSchema>,
) {
  const workspace = await authorize(organizationId, userId);
  const values = updateWhatsappAiSettingsSchema.parse(input);
  const { row: currentRow, text: before } = await current(organizationId);
  checkRevision(values.expectedRevision, await revision(before));
  const after = whatsappAiTextSchema.parse({
    ...before,
    replyStyle:
      values.replyStyle !== undefined ? values.replyStyle : before.replyStyle,
    responseMessages:
      values.responseMessages !== undefined
        ? values.responseMessages
        : before.responseMessages,
    instructions:
      values.appendRule !== undefined
        ? [before.instructions, values.appendRule]
            .filter((part) => part !== null && part !== "")
            .join("\n\n")
        : values.instructions !== undefined
          ? values.instructions
          : before.instructions,
    handoffMessage:
      values.handoffMessage !== undefined
        ? values.handoffMessage
        : before.handoffMessage,
  });
  return save(organizationId, userId, workspace, {
    before,
    after,
    operation: "update",
    expectedResponseMessagesJson: currentRow?.responseMessagesJson ?? null,
  });
}

async function history(
  organizationId: string,
  userId: string,
  options: { versionId?: string; limit: number; offset: number },
) {
  const workspace = await authorize(organizationId, userId);
  if (options.versionId) {
    const row = await Repo.getVersion(organizationId, options.versionId);
    if (!row)
      throw new AppError(
        "NOT_FOUND",
        "Settings version not found in this workspace.",
      );
    return {
      workspace,
      versions: [
        {
          id: row.id,
          actorUserId: row.actorUserId,
          createdAt: row.createdAt,
          ...parseVersion(row.metadataJson),
        },
      ],
      nextOffset: null,
    };
  }
  const rows = await Repo.history(
    organizationId,
    options.limit,
    options.offset,
  );
  return {
    workspace,
    versions: rows.slice(0, options.limit).map((row) => ({
      id: row.id,
      actorUserId: row.actorUserId,
      createdAt: row.createdAt,
      operation: parseVersion(row.metadataJson).operation,
    })),
    nextOffset:
      rows.length > options.limit ? options.offset + options.limit : null,
  };
}

async function restore(
  organizationId: string,
  userId: string,
  input: z.infer<typeof restoreWhatsappAiSettingsSchema>,
) {
  const workspace = await authorize(organizationId, userId);
  const values = restoreWhatsappAiSettingsSchema.parse(input);
  const row = await Repo.getVersion(organizationId, values.versionId);
  if (!row)
    throw new AppError(
      "NOT_FOUND",
      "Settings version not found in this workspace.",
    );
  const { row: currentRow, text: before } = await current(organizationId);
  checkRevision(values.expectedRevision, await revision(before));
  return save(organizationId, userId, workspace, {
    before,
    after: parseVersion(row.metadataJson)[values.side],
    operation: "restore",
    expectedResponseMessagesJson: currentRow?.responseMessagesJson ?? null,
  });
}

export const WhatsappAiSettingsService = { get, update, history, restore };
