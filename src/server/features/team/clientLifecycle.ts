/**
 * When a client login hears from us, and what we say.
 *
 * Pure on purpose: the timing rules are the part worth testing, and they are
 * testable here without a database, a clock or an email provider.
 *
 * A client who signs in resets the run — the idle clock is measured from
 * whichever is later, their last sign-in or their welcome email, so someone
 * using the app is never nudged about not using it.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days idle before each email. The last one warns about closing the account. */
const STAGE_DAYS = [3, 10, 14] as const;

export const LAST_STAGE = STAGE_DAYS.length;

type ClientLifecycleState = {
  welcomeSentAt: string | null;
  createdAt: string;
  /** Latest sign-in we know about, or null if they have never signed in. */
  lastSeenAt: string | null;
  nudgeStage: number;
  lastNudgeAt: string | null;
};

export type ClientEmail = {
  stage: number;
  subject: string;
  heading: string;
  body: string;
  buttonLabel: string;
};

function at(iso: string | null) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** The instant the idle clock starts from. */
function idleSince(state: ClientLifecycleState) {
  const candidates = [
    at(state.lastSeenAt),
    at(state.welcomeSentAt),
    at(state.createdAt),
  ].filter((ms): ms is number => ms !== null);
  return candidates.length ? Math.max(...candidates) : null;
}

/**
 * The stage this login has earned by now, which is not always the next one:
 * someone who signs in and then goes quiet again starts from the beginning.
 */
export function dueStage(now: Date, state: ClientLifecycleState) {
  const since = idleSince(state);
  if (since === null) return null;
  // A sign-in after the last nudge wipes the run; the caller writes the reset.
  const seen = at(state.lastSeenAt);
  const nudged = at(state.lastNudgeAt);
  const stage =
    seen !== null && nudged !== null && seen > nudged ? 0 : state.nudgeStage;
  if (stage >= LAST_STAGE) return null;
  const idleDays = (now.getTime() - since) / DAY_MS;
  return idleDays >= STAGE_DAYS[stage] ? stage + 1 : null;
}

export function welcomeEmail(workspace: string): ClientEmail {
  return {
    stage: 0,
    subject: `Your ${workspace} account is ready`,
    heading: "Your account has been set up",
    body: `Welcome aboard. An account has been created for you on the ${workspace} workspace, where you'll be able to see your leads, quotes, messages and how the site is performing. Your sign-in details are not in this email — one of our team will send them to you shortly. There is nothing you need to do until then.`,
    buttonLabel: "Open the sign-in page",
  };
}

/** The email for a stage, 1 to 3. Returns null for anything outside that. */
export function nudgeEmail(
  stage: number,
  workspace: string,
): ClientEmail | null {
  if (stage === 1) {
    return {
      stage,
      subject: "How are you finding it so far?",
      heading: "Everything okay getting started?",
      body: `We noticed your ${workspace} workspace has been quiet since we set it up. If anything is in the way — signing in, finding your way around, or something that isn't doing what you expected — reply to this email and we'll sort it out.`,
      buttonLabel: "Sign in",
    };
  }
  if (stage === 2) {
    return {
      stage,
      subject: "Still here if you need a hand",
      heading: "We haven't seen you in a while",
      body: `Your ${workspace} workspace is still set up and waiting. If now isn't the right time, that's completely fine — just let us know. If you'd like a quick walkthrough instead, reply and we'll book ten minutes.`,
      buttonLabel: "Sign in",
    };
  }
  if (stage === 3) {
    return {
      stage,
      subject: `About your ${workspace} workspace`,
      heading: "We'll close this workspace unless we hear from you",
      body: `There has been no activity on your ${workspace} workspace for two weeks, so we're planning to close it and free up the space. Nothing has been deleted yet. Sign in, or reply to this email, and we'll keep it open — otherwise it will be removed.`,
      buttonLabel: "Keep my workspace open",
    };
  }
  return null;
}
