import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { Client } from "@libsql/client";
import { RankTrackingRepository } from "./RankTrackingRepository";

const state = vi.hoisted(() => ({ client: null as Client | null }));
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/db", async () => {
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  state.client = createClient({ url: ":memory:" });
  return { db: drizzle(state.client) };
});
vi.mock("@/db/d1/client", async () => ({ d1Db: (await import("@/db")).db }));
vi.mock("@/db/pg/client", () => ({ pgDb: {} }));

beforeAll(async () => {
  await state.client!.executeMultiple(`
    CREATE TABLE rank_tracking_configs(id TEXT PRIMARY KEY);
    CREATE TABLE projects(id TEXT PRIMARY KEY);
    CREATE TABLE rank_check_runs(id TEXT PRIMARY KEY, config_id TEXT, project_id TEXT, status TEXT,
      keywords_total INTEGER DEFAULT 0, keywords_checked INTEGER DEFAULT 0, is_subset_run INTEGER DEFAULT 0,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP, completed_at TEXT, error_message TEXT);
    CREATE TABLE rank_snapshots(id INTEGER PRIMARY KEY, run_id TEXT, tracking_keyword_id TEXT,
      keyword TEXT, device TEXT, position INTEGER, url TEXT, serp_features TEXT, checked_at TEXT);
  `);
  for (const statement of readFileSync(
    "drizzle/0120_perpetual_nicolaos.sql",
    "utf8",
  ).split("--> statement-breakpoint")) {
    if (statement.trim()) await state.client!.execute(statement);
  }
});
afterAll(() => state.client!.close());
beforeEach(async () => {
  await state.client!
    .executeMultiple(`DELETE FROM rank_snapshots; DELETE FROM rank_check_run_targets; DELETE FROM rank_check_runs;
    INSERT INTO rank_check_runs(id, config_id, status, started_at) VALUES('run', 'config', 'pending', '2026-11-22 12:00:00');`);
});
it("freezes all device targets and replay cannot append changed keywords/devices", async () => {
  const initial = await RankTrackingRepository.prepareRunTargets(
    "run",
    [{ id: "one", keyword: "original" }],
    "both",
  );
  expect(initial).toHaveLength(2);
  const replay = await RankTrackingRepository.prepareRunTargets(
    "run",
    [{ id: "two", keyword: "edited" }],
    "desktop",
  );
  expect(replay).toEqual(initial);
  expect(await RankTrackingRepository.getRunById("run")).toMatchObject({
    targetsPrepared: true,
    keywordsTotal: 1,
  });
});
it("rolls the marker and entire target plan back when one target fails", async () => {
  await expect(
    RankTrackingRepository.prepareRunTargets(
      "run",
      [
        { id: "one", keyword: "one" },
        { id: "one", keyword: "duplicate" },
      ],
      "desktop",
    ),
  ).rejects.toThrow();
  expect(await RankTrackingRepository.getTargetsForRun("run")).toEqual([]);
  expect(await RankTrackingRepository.getRunById("run")).toMatchObject({
    targetsPrepared: false,
    status: "pending",
  });
});
it("retains successful snapshots from a failed run and distinguishes unchecked matrix/trend cells", async () => {
  await RankTrackingRepository.prepareRunTargets(
    "run",
    [
      { id: "one", keyword: "one" },
      { id: "two", keyword: "two" },
    ],
    "both",
  );
  await state.client!
    .executeMultiple(`UPDATE rank_check_runs SET status='failed' WHERE id='run';
    INSERT INTO rank_snapshots(run_id, tracking_keyword_id, keyword, device, position, checked_at)
      VALUES('run', 'one', 'one', 'mobile', NULL, '2026-11-22 12:00:00');`);
  const matrix = await RankTrackingRepository.getPositionMatrix(
    "config",
    "mobile",
    12,
  );
  expect(matrix).toEqual([
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
    await RankTrackingRepository.getLatestSnapshotsForKeywords("config"),
  ).toHaveLength(1);
  expect(
    await RankTrackingRepository.getConfigTrend("config", "mobile", 730),
  ).toEqual([expect.objectContaining({ total: 1, intendedTotal: 2, top3: 0 })]);
});
it("does not invent missing coverage for legacy runs", async () => {
  await state.client!
    .executeMultiple(`UPDATE rank_check_runs SET status='completed' WHERE id='run';
    INSERT INTO rank_snapshots(run_id, tracking_keyword_id, keyword, device, position, checked_at)
      VALUES('run', 'one', 'one', 'mobile', 3, '2026-11-22 12:00:00');`);
  expect(
    await RankTrackingRepository.getConfigTrend("config", "mobile", 730),
  ).toEqual([expect.objectContaining({ total: 1, intendedTotal: null })]);
  expect(
    await RankTrackingRepository.getPositionMatrix("config", "mobile", 12),
  ).toEqual([
    expect.objectContaining({ trackingKeywordId: "one", checked: true }),
  ]);
});

it("does not revive a failed run or return its prepared targets for paid replay", async () => {
  await RankTrackingRepository.prepareRunTargets(
    "run",
    [{ id: "one", keyword: "one" }],
    "both",
  );
  await state.client!.execute(
    "UPDATE rank_check_runs SET status='failed' WHERE id='run'",
  );
  expect(
    await RankTrackingRepository.prepareRunTargets(
      "run",
      [{ id: "two", keyword: "two" }],
      "desktop",
    ),
  ).toEqual([]);
  expect(await RankTrackingRepository.getRunById("run")).toMatchObject({
    status: "failed",
  });
  expect(await RankTrackingRepository.getTargetsForRun("run")).toHaveLength(2);
});
it("freezes the supported 1000-keyword both-device limit atomically", async () => {
  const keywords = Array.from({ length: 1000 }, (_, i) => ({
    id: `kw-${i}`,
    keyword: `query ${i}`,
  }));
  expect(
    await RankTrackingRepository.prepareRunTargets("run", keywords, "both"),
  ).toHaveLength(2000);
});

it("keeps terminal results immutable when late cleanup or finalization arrives", async () => {
  expect(
    await RankTrackingRepository.updateRun("run", {
      status: "completed",
      keywordsChecked: 1,
    }),
  ).toBe(true);
  expect(
    await RankTrackingRepository.updateRun("run", {
      status: "failed",
      keywordsChecked: 0,
      errorMessage: "late cleanup",
    }),
  ).toBe(false);
  expect(await RankTrackingRepository.getRunById("run")).toMatchObject({
    status: "completed",
    keywordsChecked: 1,
    errorMessage: null,
  });
});
