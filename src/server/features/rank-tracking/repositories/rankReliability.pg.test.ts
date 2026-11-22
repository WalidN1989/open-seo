import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type postgres from "postgres";
import { RankTrackingRepository } from "./RankTrackingRepository";

// Opt-in isolated database only; normal CI retains the real SQLite coverage.
const state = vi.hoisted(() => ({
  url: process.env.RANK_RELIABILITY_TEST_DATABASE_URL,
  sql: null as postgres.Sql | null,
}));
vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "postgres" },
}));
vi.mock("@/db", async () => {
  if (!state.url) return { db: {} };
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  state.sql = postgres(state.url, { max: 4 });
  return { db: drizzle(state.sql) };
});
vi.mock("@/db/pg/client", async () => ({ pgDb: (await import("@/db")).db }));
vi.mock("@/db/d1/client", () => ({ d1Db: {} }));
beforeAll(async () => {
  if (!state.sql) return;
  await state.sql
    .unsafe(
      `
    CREATE TABLE rank_check_runs(id TEXT PRIMARY KEY, config_id TEXT, project_id TEXT, status TEXT,
      keywords_total INTEGER DEFAULT 0, keywords_checked INTEGER DEFAULT 0, is_subset_run BOOLEAN DEFAULT false,
      started_at TEXT DEFAULT '2026-11-22T12:00:00.000Z', completed_at TEXT, error_message TEXT);
    CREATE TABLE rank_snapshots(id SERIAL PRIMARY KEY, run_id TEXT, tracking_keyword_id TEXT,
      keyword TEXT, device TEXT, position INTEGER, url TEXT, serp_features TEXT, checked_at TEXT);
    INSERT INTO rank_check_runs(id, config_id, status) VALUES('legacy', 'config', 'completed');
  `,
    )
    .simple();
  for (const statement of readFileSync(
    "drizzle-pg/0099_worried_echo.sql",
    "utf8",
  ).split("--> statement-breakpoint")) {
    if (statement.trim()) await state.sql.unsafe(statement);
  }
});
afterAll(async () => {
  await state.sql?.end();
});
it.skipIf(!state.url)(
  "preserves legacy data and serializes concurrent freeze transactions on real Postgres",
  async () => {
    expect(await RankTrackingRepository.getRunById("legacy")).toMatchObject({
      status: "completed",
      targetsPrepared: false,
    });
    await state.sql!`INSERT INTO rank_check_runs(id, config_id, status) VALUES('run', 'config', 'pending')`;
    const plans = await Promise.all([
      RankTrackingRepository.prepareRunTargets(
        "run",
        [{ id: "one", keyword: "first" }],
        "both",
      ),
      RankTrackingRepository.prepareRunTargets(
        "run",
        [{ id: "two", keyword: "second" }],
        "desktop",
      ),
    ]);
    expect(plans[0]).toEqual(plans[1]);
    expect(
      new Set(plans[0].map((target) => target.trackingKeywordId)).size,
    ).toBe(1);
  },
);
it.skipIf(!state.url)(
  "evaluates missing/checked coverage and failed-run observations on real Postgres",
  async () => {
    await state.sql!`INSERT INTO rank_check_runs(id, config_id, status) VALUES('partial', 'other', 'pending')`;
    await RankTrackingRepository.prepareRunTargets(
      "partial",
      [
        { id: "one", keyword: "one" },
        { id: "two", keyword: "two" },
      ],
      "both",
    );
    await state.sql!`UPDATE rank_check_runs SET status='failed' WHERE id='partial'`;
    await state.sql!`INSERT INTO rank_snapshots(run_id, tracking_keyword_id, keyword, device, position, checked_at)
    VALUES('partial', 'one', 'one', 'mobile', NULL, '2026-11-22T12:00:00.000Z')`;
    expect(
      await RankTrackingRepository.getConfigTrend("other", "mobile", 730),
    ).toEqual([
      expect.objectContaining({ total: 1, intendedTotal: "2", top3: "0" }),
    ]);
    expect(
      await RankTrackingRepository.getPositionMatrix("other", "mobile", 12),
    ).toEqual([
      expect.objectContaining({
        trackingKeywordId: "one",
        position: null,
        checked: true,
      }),
      expect.objectContaining({
        trackingKeywordId: "two",
        position: null,
        checked: false,
      }),
    ]);
    expect(
      await RankTrackingRepository.getLatestSnapshotsForKeywords("other"),
    ).toHaveLength(1);
  },
);
