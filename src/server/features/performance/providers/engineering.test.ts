import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { engineeringSignals } from "./engineering";
const config = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: (name: string) =>
    Promise.resolve(config.values.get(name)),
}));
vi.mock("@/server/lib/setup-status", () => ({
  getSelfHostSetupStatus: () =>
    Promise.resolve({ checks: { database: { status: "ok" } } }),
}));
beforeEach(() => config.values.clear());
afterEach(() => vi.unstubAllGlobals());
describe("engineering evidence", () => {
  it("does not invent healthy provider coverage when unconfigured", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const signals = await engineeringSignals();
    expect(signals.filter((s) => s.status === "not_configured")).toHaveLength(
      3,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses the latest returned run per workflow, preserves failures and marks old success stale", async () => {
    config.values.set("PERFORMANCE_GITHUB_REPOSITORY", "example/repo");
    config.values.set("PERFORMANCE_GITHUB_TOKEN", "test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          Response.json(
            url.includes("/pulls")
              ? []
              : {
                  workflow_runs: [
                    run(3, 1, "failure", new Date().toISOString()),
                    run(2, 1, "success", "2020-01-01T00:00:00Z"),
                    run(1, 2, "success", "2020-01-01T00:00:00Z"),
                  ],
                },
          ),
        ),
      ),
    );
    const signals = await engineeringSignals();
    expect(signals.find((s) => s.id === "github:3")?.status).toBe("attention");
    expect(signals.some((s) => s.id === "github:2")).toBe(false);
    expect(signals.find((s) => s.id === "github:1")?.status).toBe("stale");
  });
  it("keeps independent GitHub results when another request fails and excludes raw provider errors", async () => {
    config.values.set("PERFORMANCE_GITHUB_REPOSITORY", "example/repo");
    config.values.set("PERFORMANCE_GITHUB_TOKEN", "test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.includes("/pulls")
          ? Promise.resolve(Response.json([]))
          : Promise.reject(new Error("secret-provider-details")),
      ),
    );
    const signals = await engineeringSignals();
    expect(signals.find((s) => s.system === "GitHub checks")?.status).toBe(
      "unable_to_check",
    );
    expect(
      signals.find((s) => s.system === "GitHub pull requests")?.status,
    ).toBe("healthy");
    expect(JSON.stringify(signals)).not.toContain("secret-provider-details");
  });
  it("treats Railway GraphQL errors as unable to check and never returns a healthy deployment", async () => {
    for (const key of ["TOKEN", "PROJECT_ID", "ENVIRONMENT_ID", "SERVICE_ID"])
      config.values.set(`PERFORMANCE_RAILWAY_${key}`, "test");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ errors: [{ message: "unauthorized" }], data: null }),
        ),
    );
    expect(
      (await engineeringSignals()).find((s) => s.system === "Railway")?.status,
    ).toBe("unable_to_check");
  });
});

function run(id: number, workflow: number, conclusion: string, time: string) {
  return {
    id,
    workflow_id: workflow,
    name: "CI",
    status: "completed",
    conclusion,
    updated_at: time,
  };
}
