import { describe, expect, it, vi } from "vitest";
import { toRankTrackingTimestamp } from "@/server/features/rank-tracking/rankTrackingTimestamps";
const state = vi.hoisted(() => ({ provider: "d1" }));
vi.mock("@/db/provider", () => ({ getDatabaseProvider: () => state.provider }));
describe("rank tracking timestamps", () => {
  it("uses the actual stored timestamp format for SQLite and Postgres comparison cutoffs", () => {
    const date = new Date("2026-06-09T12:34:56.789Z");
    state.provider = "d1";
    expect(toRankTrackingTimestamp(date)).toBe("2026-06-09 12:34:56");
    state.provider = "postgres";
    expect(toRankTrackingTimestamp(date)).toBe("2026-06-09T12:34:56.789Z");
  });
});
