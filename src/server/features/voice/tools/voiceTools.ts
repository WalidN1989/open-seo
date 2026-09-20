import type { VoiceTool } from "@/server/features/communications/providers/voice-ai";

/**
 * What the voice agent can actually do, described for the model.
 *
 * Everything here is something a person could do in the app themselves; the
 * agent does it while they talk instead. Reading and writing are free; the
 * one that spends money — running a rank check — is refused unless the
 * person has just said yes to it out loud.
 */

export const VOICE_TOOLS: VoiceTool[] = [
  {
    name: "list_rank_trackers",
    description:
      "The rank trackers on this project: the domain, how many keywords each has, and when it last ran.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_rank_tracker",
    description:
      "Start tracking keyword positions for this project's own domain. Free: it sets the tracking up but does not check positions yet. Use when they ask you to set up or start rank tracking.",
    input_schema: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: { type: "string" },
          description: "The keywords to watch, as the person said them.",
        },
        interval: {
          type: "string",
          enum: ["weekly", "monthly", "manual"],
          description:
            "How often it should check. Weekly unless they say otherwise.",
        },
      },
      required: ["keywords"],
    },
  },
  {
    name: "add_rank_keywords",
    description: "Add keywords to this project's existing rank tracker. Free.",
    input_schema: {
      type: "object",
      properties: {
        keywords: { type: "array", items: { type: "string" } },
      },
      required: ["keywords"],
    },
  },
  {
    name: "remove_rank_keywords",
    description:
      "Stop watching keywords on this project's rank tracker. Free. Name them as the person did.",
    input_schema: {
      type: "object",
      properties: {
        keywords: { type: "array", items: { type: "string" } },
      },
      required: ["keywords"],
    },
  },
  {
    name: "estimate_rank_check",
    description:
      "What checking every tracked keyword right now would cost in credits. Free. Say this figure before offering to run a check.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "run_rank_check",
    description:
      "Check positions now. THIS SPENDS CREDITS. Only after you have said the cost from estimate_rank_check and the person has agreed out loud in their last turn.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_leads",
    description:
      "The open leads in this workspace, with who they are and what stage they are at.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "log_lead_activity",
    description:
      "Write a note against a lead — what was discussed, what was agreed. Use when they say to log, note or record something about a customer.",
    input_schema: {
      type: "object",
      properties: {
        lead: {
          type: "string",
          description:
            "The lead, customer or company name as the person said it.",
        },
        note: {
          type: "string",
          description: "What to record, in their words.",
        },
        activityType: {
          type: "string",
          enum: ["call", "meeting", "email", "whatsapp", "note"],
          description: "How it happened. A note unless they say otherwise.",
        },
      },
      required: ["lead", "note"],
    },
  },
  {
    name: "create_lead",
    description:
      "Add a new lead to the CRM: a person or business who has shown interest.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: 'What the lead is, e.g. "Kids\' sneakers — Hania".',
        },
        note: {
          type: "string",
          description: "Anything else they said about it.",
        },
      },
      required: ["title"],
    },
  },
];

const YES =
  /\b(yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|please do|run it|go for it|confirm|confirmed|absolutely|of course)\b/i;
const NO = /\b(no|not now|wait|hold on|don'?t|stop|later)\b/i;

/**
 * Whether the person just agreed to something.
 *
 * The guard on spending: a rank check costs credits, and the model asking
 * for one is not enough — the last thing the person said has to be a yes.
 */
export function isAffirmative(said: string) {
  const text = said.trim();
  if (!text || text.length > 120) return false;
  return YES.test(text) && !NO.test(text);
}

function plain(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The lead they mean, matched on the lead's own name, contact or company. */
export function matchLead<
  T extends {
    title: string;
    contactName?: string | null;
    companyName?: string | null;
  },
>(leads: readonly T[], said: string): T | null {
  const wanted = plain(said);
  if (!wanted) return null;
  const fields = (lead: T) =>
    [lead.title, lead.contactName, lead.companyName]
      .filter((value): value is string => Boolean(value))
      .map(plain);
  return (
    leads.find((lead) => fields(lead).some((field) => field === wanted)) ??
    leads.find((lead) =>
      fields(lead).some(
        (field) => field.includes(wanted) || wanted.includes(field),
      ),
    ) ??
    null
  );
}
