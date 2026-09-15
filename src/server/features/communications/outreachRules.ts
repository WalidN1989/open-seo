import { inWorkingHours } from "@/server/lib/working-hours";

/**
 * When an agent may message a customer on WhatsApp or SMS. The rules live
 * here, in code, so an agent acting on its own cannot talk itself past them:
 * - someone who opted out is never messaged;
 * - WhatsApp free text needs the customer to have written in the last 24
 *   hours (Meta's customer-service window); outside it only a template goes;
 * - a message they haven't answered is followed by at most one more a day;
 * - a message they didn't prompt goes only in working hours.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** STOP-style replies, the words carriers and Meta treat as opting out. */
const OPT_OUT =
  /^\s*(stop|stop all|stopall|unsubscribe|cancel|end|quit|opt[ -]?out)\s*[.!]*\s*$/i;
const OPT_IN = /^\s*(start|unstop)\s*[.!]*\s*$/i;

export function optOutChange(body: string | null): "out" | "in" | null {
  if (!body) return null;
  if (OPT_OUT.test(body)) return "out";
  if (OPT_IN.test(body)) return "in";
  return null;
}

export type OutreachState = {
  optedOut: boolean;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
};

type OutreachDecision =
  | { allowed: true; prompted: boolean }
  | { allowed: false; reason: string };

export function outreachDecision(
  state: OutreachState,
  input: { freeText: boolean; needsWindow: boolean; timeZone: string },
  now = new Date(),
): OutreachDecision {
  if (state.optedOut) {
    return {
      allowed: false,
      reason: "This customer opted out of messages. Do not contact them here.",
    };
  }
  const inbound = state.lastInboundAt ? Date.parse(state.lastInboundAt) : null;
  const outbound = state.lastOutboundAt
    ? Date.parse(state.lastOutboundAt)
    : null;
  if (
    input.needsWindow &&
    input.freeText &&
    (inbound === null || now.getTime() - inbound > DAY_MS)
  ) {
    return {
      allowed: false,
      reason:
        "The customer hasn't written in the last 24 hours, so WhatsApp only allows an approved template.",
    };
  }
  // They wrote after our last message: this is a reply to them.
  const prompted =
    inbound !== null && (outbound === null || inbound > outbound);
  if (prompted) return { allowed: true, prompted };
  if (outbound !== null && now.getTime() - outbound < DAY_MS) {
    return {
      allowed: false,
      reason:
        "They haven't answered the last message, sent less than 24 hours ago. Wait before following up again.",
    };
  }
  if (!inWorkingHours(now, input.timeZone)) {
    return {
      allowed: false,
      reason:
        "A follow-up they didn't ask for only goes out Monday to Friday, 9am to 5pm their business time.",
    };
  }
  return { allowed: true, prompted };
}
