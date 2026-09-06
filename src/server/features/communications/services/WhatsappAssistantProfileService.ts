import { AppError } from "@/server/lib/errors";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { ProjectContextService } from "@/server/features/project-context/services/ProjectContextService";
import {
  firecrawlConnection,
  readProjectSite,
} from "@/server/features/project-context/services/ContextDraftService";
import { CommunicationsRepository } from "../repositories/CommunicationsRepository";
import { WhatsappAssistantRepository as Repo } from "../repositories/WhatsappAssistantRepository";
import {
  draftAssistantProfile,
  type ProfileSource,
} from "../providers/assistant-profile-draft";
import { resolveAiKey } from "./WhatsappAssistantService";

/** Below this, the Context tab is a header and blanks, not knowledge. */
const CONTEXT_MIN_CHARS = 120;

async function contextSource(projectId: string): Promise<ProfileSource | null> {
  try {
    const context = await ProjectContextService.getProjectContext(projectId);
    const markdown =
      ProjectContextService.renderProjectContextMarkdown(context);
    const body = markdown.replace(/^#\s*Project context\s*/i, "").trim();
    return body.length >= CONTEXT_MIN_CHARS
      ? { kind: "context", markdown }
      : null;
  } catch {
    return null;
  }
}

/**
 * Draft the persona and business facts for the organisation's assistant from
 * what the business already published: its Context tab when that is filled,
 * its website otherwise. Returns a draft for review, never saves.
 */
async function draftProfile(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "admin",
  );
  const project = await Repo.projectForOrganization(organizationId);
  if (!project)
    throw new AppError("NOT_FOUND", "No project for this business.");
  const domain = project.domain?.trim().replace(/^https?:\/\//, "") || null;

  let source = await contextSource(project.id);
  let origin: "context" | "firecrawl" | "builtin" = "context";
  let pagesRead = 0;
  if (!source) {
    if (!domain) return { status: "no_domain" as const };
    const read = await readProjectSite(organizationId, domain);
    if (!read.pages.length) {
      return {
        status: "unreadable" as const,
        domain,
        firecrawlConnected: Boolean(await firecrawlConnection(organizationId)),
      };
    }
    source = { kind: "pages", pages: read.pages };
    origin = read.source;
    pagesRead = read.pages.length;
  }

  const aiConnection = await CommunicationsRepository.getIntegrationByProvider(
    organizationId,
    "claude_haiku",
  );
  const apiKey =
    aiConnection?.status === "connected"
      ? await resolveAiKey(aiConnection)
      : null;
  const draft = await draftAssistantProfile({
    businessName: project.name,
    domain,
    source,
    apiKey,
  });
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "whatsapp.assistant.profile.drafted",
    targetType: "whatsapp_assistant",
    targetId: organizationId,
    metadata: { source: origin, pagesRead },
  });
  return { status: "drafted" as const, ...draft, source: origin, pagesRead };
}

export const WhatsappAssistantProfileService = { draftProfile };
