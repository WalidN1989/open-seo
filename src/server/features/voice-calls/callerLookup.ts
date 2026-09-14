import { z } from "zod";

/**
 * ElevenLabs asks before an inbound phone call starts who is calling
 * ("conversation initiation client data"). The answer fills the agent's
 * dynamic variables, so a known caller is greeted by name and not asked for
 * what the CRM already holds.
 *
 * The agent's prompt reads these names; the agent also carries them as
 * placeholders, which is what a website call (no lookup) falls back to.
 */
export const CALLER_DEFAULTS = {
  caller_known: "no",
  caller_first_name: "",
  caller_email_hint: "",
  caller_last_enquiry: "",
};

export const initiationRequestSchema = z.object({
  caller_id: z.string().nullable().optional(),
});

type KnownCaller = {
  firstName: string | null;
  email: string | null;
  leadTitle: string | null;
};

/**
 * Enough of an address for the caller to recognise it, not enough to read
 * someone's email out to whoever rings from a spoofed number.
 */
export function emailHint(email: string | null) {
  const [local, domain] = (email ?? "").split("@");
  if (!local || !domain) return "";
  return `${local[0]}…@${domain}`;
}

/** "Website build — Walid Nazmi" keeps only what they asked about. */
function enquiryFrom(leadTitle: string | null) {
  return (leadTitle ?? "").split(" — ")[0]?.trim() ?? "";
}

/** A CRM name is typed by people; keep it to something safe to speak. */
function speakableName(name: string | null) {
  const cleaned = (name ?? "").replace(/[^\p{L}\p{M}' -]/gu, "").trim();
  return cleaned === "Caller" ? "" : cleaned.slice(0, 40);
}

type InitiationResponse = {
  type: "conversation_initiation_client_data";
  dynamic_variables: typeof CALLER_DEFAULTS;
  conversation_config_override?: { agent: { first_message: string } };
};

export function initiationResponse(
  caller: KnownCaller | null,
): InitiationResponse {
  if (!caller) {
    return {
      type: "conversation_initiation_client_data",
      dynamic_variables: CALLER_DEFAULTS,
    };
  }
  const firstName = speakableName(caller.firstName);
  return {
    type: "conversation_initiation_client_data",
    dynamic_variables: {
      caller_known: "yes",
      caller_first_name: firstName,
      caller_email_hint: emailHint(caller.email),
      caller_last_enquiry: enquiryFrom(caller.leadTitle),
    },
    conversation_config_override: {
      agent: {
        first_message: `[warmly] Hi${firstName ? ` ${firstName}` : ""}, welcome back to Digital Urgency, it's Shifa. How can I help you today?`,
      },
    },
  };
}
