import { readFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
const client = createClient({ url: ":memory:" });
const database = drizzle(client);
vi.mock("@/db", () => ({ db: database }));
vi.mock("@/db/schema", async () => ({
  ...(await import("@/db/business.schema")),
}));
vi.mock("@/db/runBatch", () => ({
  runBatch: async (
    build: (tx: typeof database) => Parameters<typeof database.batch>[0],
  ) => {
    await database.batch(build(database));
  },
}));
const { SourceRepository } = await import("./SourceRepository");
beforeEach(async () => {
  await client.execute("PRAGMA foreign_keys=OFF");
  for (const name of [
    "crm_companies",
    "crm_contacts",
    "crm_leads",
    "crm_source_runs",
    "crm_source_candidates",
  ])
    await client.execute(`DROP TABLE IF EXISTS ${name}`);
  for (const migration of [
    "0043_overrated_luke_cage",
    "0059_free_randall_flagg",
  ]) {
    const text = readFileSync(
      new URL(`../../../../../drizzle/${migration}.sql`, import.meta.url),
      "utf8",
    );
    for (const statement of text.split("--> statement-breakpoint")) {
      if (
        /CREATE TABLE `crm_(companies|contacts|leads|source_runs|source_candidates)`/.test(
          statement,
        ) ||
        /CREATE UNIQUE INDEX `crm_source_candidates_org_provider_external_idx`/.test(
          statement,
        )
      )
        await client.execute(statement);
    }
  }
  for (const name of ["industry", "country"])
    await client.execute(`ALTER TABLE crm_companies ADD COLUMN ${name} text`);
  // The Leads columns were added by later CRM migrations.
  const columns = (
    await client.execute("PRAGMA table_info(crm_leads)")
  ).rows.map((row) => row.name);
  for (const [name, type] of [
    ["notes", "text"],
    ["value_cents", "integer DEFAULT 0"],
    ["priority", "text DEFAULT 'medium'"],
    ["category", "text"],
    ["lead_score", "integer DEFAULT 0"],
    ["next_action", "text"],
    ["next_action_due", "text"],
    ["lost_reason", "text"],
    ["last_activity_at", "text"],
  ]) {
    if (!columns.includes(name))
      await client.execute(`ALTER TABLE crm_leads ADD COLUMN ${name} ${type}`);
  }
  await client.execute(
    readFileSync(
      new URL(
        "../../../../../drizzle/0117_prospect_apify_runs.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await client.execute(
    "INSERT INTO crm_source_runs (id, organization_id, provider, query) VALUES ('run1','org1','manual','Painters')",
  );
  await client.execute(
    "INSERT INTO crm_source_candidates (id, organization_id, run_id, external_id, provider, company_name, email, phone, profile_url) VALUES ('c1','org1','run1','external1','manual','Swinton','office@example.com','+61456400758','https://maps.app.goo.gl/example')",
  );
});
afterAll(() => client.close());
it("only one concurrent request can claim a prospect", async () => {
  const results = await Promise.all([
    SourceRepository.claimForPromotion("org1", "c1"),
    SourceRepository.claimForPromotion("org1", "c1"),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(
    await SourceRepository.claimForPromotion("other", "c1"),
  ).toBeUndefined();
});
it("commits the lead, company, source link and count while preserving business email", async () => {
  const claimed = await SourceRepository.claimForPromotion("org1", "c1");
  const { leadId } = await SourceRepository.convertClaimed("org1", claimed, {});
  expect(
    (await client.execute("SELECT count(*) as n FROM crm_companies")).rows[0].n,
  ).toBe(1);
  expect(
    (await client.execute("SELECT count(*) as n FROM crm_contacts")).rows[0].n,
  ).toBe(0);
  const lead = (
    await client.execute({
      sql: "SELECT notes FROM crm_leads WHERE id=?",
      args: [leadId],
    })
  ).rows[0];
  expect(lead.notes).toContain("office@example.com");
  expect(lead.notes).toContain("https://maps.app.goo.gl/example");
  expect((await SourceRepository.getCandidate("org1", "c1"))?.leadId).toBe(
    leadId,
  );
  expect((await SourceRepository.getRun("org1", "run1"))?.promotedCount).toBe(
    1,
  );
});
it("rolls back every CRM insert when the lead insert fails", async () => {
  await client.execute(
    "CREATE TRIGGER fail_lead BEFORE INSERT ON crm_leads BEGIN SELECT RAISE(ABORT, 'test failure'); END",
  );
  const claimed = await SourceRepository.claimForPromotion("org1", "c1");
  await expect(
    SourceRepository.convertClaimed("org1", claimed, {}),
  ).rejects.toThrow("test failure");
  expect(
    (await client.execute("SELECT count(*) as n FROM crm_companies")).rows[0].n,
  ).toBe(0);
  expect((await SourceRepository.getCandidate("org1", "c1"))?.status).toBe(
    "reviewing",
  );
});
it("imports large batches without exceeding D1 parameter limits or duplicating businesses", async () => {
  const drafts = Array.from({ length: 100 }, (_, index) => ({
    externalId: `p${index}`,
    provider: "apify",
    companyName: `Painter ${index}`,
    evidenceScore: 0,
  }));
  expect(
    await SourceRepository.insertCandidates("org1", "run1", drafts),
  ).toEqual({ inserted: 100, skipped: 0 });
  expect(
    await SourceRepository.insertCandidates("org1", "run1", drafts),
  ).toEqual({ inserted: 0, skipped: 100 });
});
