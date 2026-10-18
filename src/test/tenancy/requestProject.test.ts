import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
import { eq } from "drizzle-orm";
import { projects } from "@/db/schema";
import { PROJECT_SCOPE_HEADER } from "@/shared/project-navigation";
import {
  assertRequestProjectInput,
  resolveRequestProject,
} from "@/middleware/ensure-user/project";
import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import {
  ORG_A,
  ORG_B,
  PROJECT_A1,
  PROJECT_A2,
  PROJECT_B1,
  USER_CONSULTANT,
  USER_OWNER_A,
  createTenancyFixture,
} from "./fixture";

let fixture: Awaited<ReturnType<typeof createTenancyFixture>>;
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/db", () => ({
  get db() {
    return fixture.db;
  },
}));

beforeAll(async () => {
  fixture = await createTenancyFixture();
  await fixture.db
    .update(projects)
    .set({ slug: "digital-urgency-aus" })
    .where(eq(projects.id, PROJECT_A1));
  await fixture.db
    .update(projects)
    .set({ slug: "booxworm" })
    .where(eq(projects.id, PROJECT_B1));
  await fixture.db
    .update(projects)
    .set({ archivedAt: "2026-10-18T00:00:00.000Z" })
    .where(eq(projects.id, PROJECT_A2));
});
afterAll(() => fixture.client.close());

const context: EnsuredUserContext = {
  userId: USER_CONSULTANT,
  userEmail: "consultant@shared.test",
  emailVerified: true,
  organizationId: ORG_B,
};
const scope = (address: string) =>
  new Headers({ [PROJECT_SCOPE_HEADER]: address });

describe("each URL authorizes its workspace independently of the shared session", () => {
  it("leaves unscoped account/API requests on their existing context", async () => {
    expect(await resolveRequestProject(context, new Headers())).toBe(context);
  });

  it("resolves concurrent tabs without changing either tab's source context", async () => {
    const [du, bx] = await Promise.all([
      resolveRequestProject(context, scope("digital-urgency-aus")),
      resolveRequestProject(context, scope("booxworm")),
    ]);
    expect(du).toMatchObject({
      organizationId: ORG_A,
      project: { id: PROJECT_A1 },
    });
    expect(bx).toMatchObject({
      organizationId: ORG_B,
      project: { id: PROJECT_B1 },
    });
    expect(context.organizationId).toBe(ORG_B);
    expect(context.project).toBeUndefined();
    expect(du).not.toBe(context);
  });

  it("accepts old IDs and readable names for the same authorized project", async () => {
    const byId = await resolveRequestProject(context, scope(PROJECT_A1));
    const byName = await resolveRequestProject(
      context,
      scope("digital-urgency-aus"),
    );
    expect(byId).toEqual(byName);
    expect(() => assertRequestProjectInput(byName, PROJECT_A1)).not.toThrow();
    expect(() =>
      assertRequestProjectInput(byName, "digital-urgency-aus"),
    ).not.toThrow();
    expect(() => assertRequestProjectInput(byName, null)).not.toThrow();
  });

  it("refuses an explicit payload for a different project, even for a multi-workspace member", async () => {
    const du = await resolveRequestProject(
      context,
      scope("digital-urgency-aus"),
    );
    expect(() => assertRequestProjectInput(du, PROJECT_B1)).toThrowError(
      new AppError("NOT_FOUND"),
    );
  });

  it("refuses a valid project name without membership", async () => {
    await expect(
      resolveRequestProject(
        { ...context, userId: USER_OWNER_A, organizationId: ORG_A },
        scope("booxworm"),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it.each([
    PROJECT_A2,
    "missing",
    "",
    "../booxworm",
    "booxworm/other",
    "x".repeat(201),
  ])(
    "refuses an archived, unknown or malformed address %s without falling back to the cookie",
    async (address) => {
      await expect(
        resolveRequestProject(context, scope(address)),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    },
  );
});
