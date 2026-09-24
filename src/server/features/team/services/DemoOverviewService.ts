import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { member, organization, projects } from "@/db/schema";
import { AppError } from "@/server/lib/errors";
import { buildDemoOverview } from "../demoBusiness";
import { ClientLoginRepository as Logins } from "../repositories/ClientLoginRepository";

/**
 * The worked example a new client lands on while their own workspace is still
 * empty.
 *
 * It is generated on read and written nowhere, so the switch that turns it on
 * changes what one person sees and nothing else. An owner or admin can open it
 * too — you cannot hand a client a page you have never looked at.
 */

async function workspace(organizationId: string) {
  const [org] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  const [project] = await db
    .select({ domain: projects.domain })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        isNotNull(projects.domain),
      ),
    )
    .limit(1);
  return {
    name: org?.name ?? "your business",
    domain: project?.domain ?? null,
  };
}

async function isAdmin(organizationId: string, userId: string) {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
    )
    .limit(1);
  return Boolean(row && ["owner", "admin"].includes(row.role));
}

async function getOverview(organizationId: string, userId: string) {
  const login = await Logins.find(organizationId, userId);
  const allowed = login?.demoData || (await isAdmin(organizationId, userId));
  if (!allowed) throw new AppError("FORBIDDEN");
  const { name, domain } = await workspace(organizationId);
  return {
    /** A preview: this person's own data is real and is what they normally see. */
    preview: !login?.demoData,
    overview: buildDemoOverview({
      seed: organizationId,
      workspace: name,
      domain,
    }),
  };
}

export const DemoOverviewService = { getOverview };
