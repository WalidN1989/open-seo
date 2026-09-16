import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { sendClientActionEmail } from "@/server/email/transactional";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { inWorkingHours } from "@/server/lib/working-hours";
import {
  dueStage,
  LAST_STAGE,
  nudgeEmail,
  welcomeEmail,
  type ClientEmail,
} from "../clientLifecycle";
import {
  ClientLoginRepository as Logins,
  type ClientLoginRow,
} from "../repositories/ClientLoginRepository";

/**
 * The emails a client login gets over its life: a welcome the moment it is
 * created, then — only if nobody ever opens the workspace — three reminders
 * that stop as soon as they sign in.
 *
 * The welcome deliberately carries no password. The account is created by the
 * agency and the credentials are handed over by a person, so an email that
 * both names the address and carries its password would be the one message
 * that could hand the account to whoever reads the inbox next.
 */

const TIME_ZONE = "Australia/Brisbane";

async function signInUrl() {
  const appUrl = ((await getOptionalEnvValue("BETTER_AUTH_URL")) ?? "").replace(
    /\/+$/,
    "",
  );
  return `${appUrl}/sign-in`;
}

async function emailOf(userId: string | null) {
  if (!userId) return undefined;
  const [row] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.email ?? undefined;
}

async function send(
  to: string,
  workspace: string,
  email: ClientEmail,
  replyTo: string | undefined,
) {
  return sendClientActionEmail({
    email: to,
    subject: email.subject,
    heading: email.heading,
    body: email.body,
    buttonLabel: email.buttonLabel,
    actionUrl: await signInUrl(),
    footer: `Sent by ${workspace}'s team. Reply to this email and a person will read it.`,
    replyTo,
    fromName: workspace,
  });
}

/** Records the login and sends the welcome. Never throws at the caller. */
async function onLoginCreated(input: {
  organizationId: string;
  userId: string;
  createdByUserId: string;
  email: string;
  workspace: string;
  demoData: boolean;
}) {
  const existing = await Logins.find(input.organizationId, input.userId);
  const row =
    existing ??
    (await Logins.create({
      organizationId: input.organizationId,
      userId: input.userId,
      createdByUserId: input.createdByUserId,
      demoData: input.demoData,
    }));
  if (!row) return "skipped: login row not created";
  if (row.welcomeStatus === "sent") return "skipped: already welcomed";

  const status = await send(
    input.email,
    input.workspace,
    welcomeEmail(input.workspace),
    await emailOf(input.createdByUserId),
  );
  await Logins.update(row.id, {
    welcomeStatus: status,
    welcomeSentAt: new Date().toISOString(),
  });
  return status;
}

/** Whether the demo switch is on for this person in this workspace. */
async function isClientLogin(organizationId: string, userId: string) {
  return Logins.find(organizationId, userId);
}

async function setDemoData(
  organizationId: string,
  userId: string,
  demoData: boolean,
) {
  const row = await Logins.find(organizationId, userId);
  if (!row) return null;
  await Logins.update(row.id, { demoData });
  return { ...row, demoData };
}

type Candidate = {
  login: ClientLoginRow;
  email: string;
  name: string;
  workspace: string;
};

function withLastSeen(candidate: Candidate, lastSeenAt: string | null) {
  return {
    welcomeSentAt: candidate.login.welcomeSentAt,
    createdAt: candidate.login.createdAt,
    lastSeenAt,
    nudgeStage: candidate.login.nudgeStage,
    lastNudgeAt: candidate.login.lastNudgeAt,
  };
}

/**
 * Sends whichever reminder each quiet login has earned, at most one per run
 * and only inside working hours — a message about an unused account is not
 * worth waking anyone at 3am for.
 */
async function runDueNudges(now = new Date()) {
  if (!inWorkingHours(now, TIME_ZONE)) return { sent: 0, considered: 0 };
  const candidates = await Logins.listUnfinished(LAST_STAGE);
  const seen = await Logins.lastSeen(
    candidates.map((candidate) => candidate.login.userId),
  );
  let sent = 0;
  for (const candidate of candidates) {
    const lastSeenAt = seen.get(candidate.login.userId) ?? null;
    const stage = dueStage(now, withLastSeen(candidate, lastSeenAt));
    if (stage === null) continue;
    const email = nudgeEmail(stage, candidate.workspace);
    if (!email) continue;
    const status = await send(
      candidate.email,
      candidate.workspace,
      email,
      await emailOf(candidate.login.createdByUserId),
    );
    await Logins.update(candidate.login.id, {
      nudgeStage: stage,
      lastNudgeAt: now.toISOString(),
    });
    if (status === "sent") sent += 1;
    await BusinessAuditRepository.record({
      organizationId: candidate.login.organizationId,
      actorUserId: "system:client-lifecycle",
      action: "team.login.nudged",
      targetType: "user",
      targetId: candidate.login.userId,
      metadata: { stage, status },
    });
  }
  return { sent, considered: candidates.length };
}

/**
 * The quiet logins in one workspace, for a person or the monitoring agent to
 * look over. It reports; closing an account stays with a person.
 */
async function quietLogins(organizationId: string, now = new Date()) {
  const rows = await Logins.listForOrganization(organizationId);
  const seen = await Logins.lastSeen(rows.map((row) => row.login.userId));
  return rows.map((row) => {
    const lastSeenAt = seen.get(row.login.userId) ?? null;
    const sinceIso =
      lastSeenAt ?? row.login.welcomeSentAt ?? row.login.createdAt;
    const sinceMs = Date.parse(sinceIso);
    return {
      userId: row.login.userId,
      name: row.name,
      email: row.email,
      neverSignedIn: lastSeenAt === null,
      lastSeenAt,
      daysQuiet: Number.isNaN(sinceMs)
        ? null
        : Math.floor((now.getTime() - sinceMs) / 86_400_000),
      remindersSent: row.login.nudgeStage,
      warnedAboutClosing: row.login.nudgeStage >= LAST_STAGE,
      demoData: row.login.demoData,
      welcomeStatus: row.login.welcomeStatus,
    };
  });
}

export const ClientLifecycleService = {
  onLoginCreated,
  isClientLogin,
  setDemoData,
  runDueNudges,
  quietLogins,
};
