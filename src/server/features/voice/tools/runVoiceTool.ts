import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { CrmRepository } from "@/server/features/crm/repositories/CrmRepository";
import { CrmService } from "@/server/features/crm/services/CrmService";
import { LeadDetailService } from "@/server/features/crm/services/LeadDetailService";
import { ProjectService } from "@/server/features/projects/services/ProjectService";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import { forgetCached } from "../cache";
import { isAffirmative, matchLead } from "./voiceTools";

/**
 * Doing what the voice agent was asked to do.
 *
 * Every call runs as the person speaking, in their own workspace, through the
 * same services the screens use — so what the agent can do is exactly what
 * they can do, and nothing is reachable by asking nicely.
 *
 * The answer each tool returns is written to be read out: short sentences,
 * no ids, no jargon.
 */

type VoiceToolContext = {
  organizationId: string;
  userId: string;
  /** The project this conversation settled on, if any. */
  projectId: string | null;
  /** The last thing the person said — the guard on spending. */
  lastUserTurn: string;
};

function field(input: unknown, key: string): unknown {
  return input && typeof input === "object" ? Reflect.get(input, key) : null;
}

function words(input: unknown, key: string): string[] {
  const value: unknown = field(input, key);
  if (!Array.isArray(value)) return [];
  return (value as unknown[])
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function said(input: unknown, key: string) {
  const value: unknown = field(input, key);
  return typeof value === "string" ? value.trim() : "";
}

/** "Hania" or "Hania Nazmi" — contacts are stored in two halves. */
function contactName(
  contact: { firstName: string; lastName: string | null } | null,
) {
  if (!contact) return null;
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
}

function list(items: string[], empty: string) {
  return items.length ? items.join(" ") : empty;
}

async function trackerFor(projectId: string) {
  const configs = await RankTrackingService.getConfigs(projectId);
  return configs.find((config) => config.isActive) ?? configs[0] ?? null;
}

async function rankTools(
  name: string,
  input: unknown,
  context: VoiceToolContext & { projectId: string },
) {
  const { projectId } = context;
  if (name === "list_rank_trackers") {
    const configs = await RankTrackingService.getConfigs(projectId);
    if (!configs.length)
      return "Nothing is being rank-tracked on this project yet.";
    const lines = await Promise.all(
      configs.map(async (config) => {
        const tracker = await RankTrackingService.getTracker(
          config.id,
          projectId,
        );
        return `${config.domain}: ${tracker.results.rows.length} keywords, last checked ${tracker.results.run?.lastCheckedAt?.slice(0, 10) ?? "never"}.`;
      }),
    );
    return list(lines, "No trackers.");
  }

  if (name === "create_rank_tracker") {
    const keywords = words(input, "keywords");
    if (!keywords.length) return "Ask which keywords to watch first.";
    const project = await ProjectService.getProjectForMember(
      context.userId,
      projectId,
    );
    if (!project?.domain) {
      return "This project has no website address saved, so there is nothing to track. Ask them to add the domain in project settings.";
    }
    const existing = await trackerFor(projectId);
    const config =
      existing ??
      (await RankTrackingService.createConfig({
        projectId,
        projectMarket: {
          locationCode: project.locationCode,
          languageCode: project.languageCode,
        },
        domain: project.domain,
        serpDepth: 100,
        scheduleInterval:
          said(input, "interval") === "monthly"
            ? "monthly"
            : said(input, "interval") === "manual"
              ? "manual"
              : "weekly",
      }));
    const added = await RankTrackingService.addKeywords(
      config.id,
      projectId,
      keywords,
      { kind: "direct_user_action" },
    );
    forgetCached(`voice:brief:${context.organizationId}`);
    return `Rank tracking is set up for ${project.domain} with ${added.added} keywords, checking ${config.scheduleInterval ?? "weekly"}. Positions are not checked yet — that costs credits, so say the word and I will run the first check.`;
  }

  const config = await trackerFor(projectId);
  if (!config) {
    return "There is no rank tracker on this project yet. Offer to set one up.";
  }

  if (name === "add_rank_keywords") {
    const keywords = words(input, "keywords");
    if (!keywords.length) return "Ask which keywords to add.";
    const added = await RankTrackingService.addKeywords(
      config.id,
      projectId,
      keywords,
      { kind: "direct_user_action" },
    );
    forgetCached(`voice:brief:${context.organizationId}`);
    return `Added ${added.added} keywords to ${config.domain}.`;
  }

  if (name === "remove_rank_keywords") {
    const wanted = words(input, "keywords").map((word) => word.toLowerCase());
    const tracker = await RankTrackingService.getTracker(config.id, projectId);
    const ids = tracker.results.rows
      .filter((row) => wanted.includes(row.keyword.toLowerCase()))
      .map((row) => row.trackingKeywordId);
    if (!ids.length) return "None of those keywords are being tracked.";
    const removed = await RankTrackingService.removeKeywords(
      config.id,
      projectId,
      ids,
    );
    forgetCached(`voice:brief:${context.organizationId}`);
    return `Stopped watching ${removed.removed} keywords.`;
  }

  if (name === "estimate_rank_check") {
    const estimate = await RankTrackingService.estimateCost(
      config.id,
      projectId,
    );
    return `Checking all ${estimate.keywordCount} keywords on ${config.domain} now costs about ${estimate.costCredits} credits.`;
  }

  if (name === "run_rank_check") {
    // The spend guard: the model asking is not enough — the person has to
    // have just agreed out loud.
    if (!isAffirmative(context.lastUserTurn)) {
      return "Not run: this spends credits. Tell them the cost and wait for them to say yes, then call this again.";
    }
    const user = await AuthRepository.getHostedUser(context.userId);
    const result = await RankTrackingService.triggerCheck({
      configId: config.id,
      projectId,
      billingCustomer: {
        organizationId: context.organizationId,
        userId: context.userId,
        userEmail: user?.email ?? "",
      },
    });
    forgetCached(`voice:brief:${context.organizationId}`);
    return result.ok
      ? `The check is running now for ${config.domain}. Positions land in Rank Tracking in a few minutes.`
      : "A check is already running for this domain; the results are on their way.";
  }
  return null;
}

async function crmTools(
  name: string,
  input: unknown,
  context: VoiceToolContext,
) {
  if (name === "list_leads") {
    const rows = await CrmRepository.listLeads(context.organizationId);
    if (!rows.length) return "There are no leads in this workspace yet.";
    return rows
      .slice(0, 12)
      .map(
        (row) =>
          `${row.lead.title}${contactName(row.contact) ? ` (${contactName(row.contact)})` : ""} — ${row.stage?.name ?? "no stage"}.`,
      )
      .join(" ");
  }

  if (name === "log_lead_activity") {
    const wanted = said(input, "lead");
    const note = said(input, "note");
    if (!wanted || !note) return "Ask which customer, and what to record.";
    const rows = await CrmRepository.listLeads(context.organizationId);
    const match = matchLead(
      rows.map((row) => ({
        title: row.lead.title,
        contactName: contactName(row.contact),
        companyName: row.company?.name ?? null,
        id: row.lead.id,
      })),
      wanted,
    );
    if (!match) {
      return `No lead matches "${wanted}". Read out a few lead names and ask which one.`;
    }
    const kind = said(input, "activityType");
    await LeadDetailService.logActivity(
      context.organizationId,
      context.userId,
      {
        leadId: match.id,
        activityType:
          kind === "call" ||
          kind === "meeting" ||
          kind === "email" ||
          kind === "whatsapp"
            ? kind
            : "note",
        notes: note,
        remind: false,
      },
    );
    return `Logged against ${match.title}.`;
  }

  if (name === "create_lead") {
    const title = said(input, "title");
    if (!title) return "Ask what the lead is for.";
    const note = said(input, "note");
    const lead = await CrmService.createLead(
      context.organizationId,
      context.userId,
      {
        title,
        priority: "medium",
        valueCents: 0,
        source: "voice agent",
        ...(note ? { notes: note } : {}),
      },
    );
    return `Added the lead "${lead.title}" to the CRM.`;
  }
  return null;
}

/** Runs one tool and returns what the agent should say about it. */
export async function runVoiceTool(
  call: { name: string; input: unknown },
  context: VoiceToolContext,
): Promise<string> {
  const projectId = context.projectId;
  const projectTool = call.name.includes("rank");
  if (projectTool && !projectId) {
    return "No project has been chosen yet. Ask which project they mean, then call this again.";
  }
  try {
    const answer =
      projectTool && projectId
        ? await rankTools(call.name, call.input, { ...context, projectId })
        : await crmTools(call.name, call.input, context);
    return answer ?? "That is not something I can do.";
  } catch (error) {
    // Refusals are the app's own rules — a module that is off, a limit
    // reached — and the agent should say what happened, not pretend.
    return error instanceof Error
      ? `That did not work: ${error.message}`
      : "That did not work.";
  }
}
