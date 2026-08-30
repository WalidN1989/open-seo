import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ integrationConnections: {} }));

const { isSyncDue } = await import("./IntegrationSyncRepository");

const NOW = Date.now();
const minutesAgo = (minutes: number) =>
  new Date(NOW - minutes * 60_000).toISOString();

function connection(overrides: Record<string, unknown> = {}) {
  return {
    syncStatus: "idle",
    autoSync: false,
    lastSyncedAt: null,
    syncIntervalMinutes: 60,
    updatedAt: minutesAgo(0),
    ...overrides,
  };
}

describe("which connections the scheduler picks up", () => {
  it("always takes a queued connection", () => {
    expect(isSyncDue(connection({ syncStatus: "queued" }), NOW)).toBe(true);
  });

  it("leaves a run that is genuinely in flight alone", () => {
    // Two schedulers on one catalogue would fight over the resume cursor.
    expect(
      isSyncDue(
        connection({ syncStatus: "running", updatedAt: minutesAgo(1) }),
        NOW,
      ),
    ).toBe(false);
  });

  it("reclaims a run that has been silent for minutes", () => {
    // A deploy or restart part-way through leaves "running" behind forever,
    // and nothing else clears it: auto-sync would stop for good.
    expect(
      isSyncDue(
        connection({ syncStatus: "running", updatedAt: minutesAgo(10) }),
        NOW,
      ),
    ).toBe(true);
  });

  it("ignores an idle connection that is not on a schedule", () => {
    expect(isSyncDue(connection({ autoSync: false }), NOW)).toBe(false);
  });

  it("takes a scheduled connection that has never synced", () => {
    expect(
      isSyncDue(connection({ autoSync: true, lastSyncedAt: null }), NOW),
    ).toBe(true);
  });

  it("waits for the interval to elapse before syncing again", () => {
    const scheduled = {
      autoSync: true,
      syncIntervalMinutes: 60,
    };
    expect(
      isSyncDue(
        connection({ ...scheduled, lastSyncedAt: minutesAgo(30) }),
        NOW,
      ),
    ).toBe(false);
    expect(
      isSyncDue(
        connection({ ...scheduled, lastSyncedAt: minutesAgo(61) }),
        NOW,
      ),
    ).toBe(true);
  });

  it("never picks up an errored connection on its own", () => {
    // A failing store would otherwise be retried every tick forever. Someone
    // presses the button, which queues it.
    expect(
      isSyncDue(connection({ syncStatus: "error", autoSync: false }), NOW),
    ).toBe(false);
  });
});
