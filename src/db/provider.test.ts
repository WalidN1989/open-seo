import { describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({}) as Record<string, unknown>);
vi.mock("cloudflare:workers", () => ({ env: mockEnv }));

const { getPostgresPoolSize } = await import("./provider");

describe("getPostgresPoolSize", () => {
  it("keeps one connection behind Hyperdrive, which pools at the edge", () => {
    mockEnv.HYPERDRIVE = { connectionString: "postgres://edge/db" };
    expect(getPostgresPoolSize()).toBe(1);
  });

  it("allows several when this client is the only pool there is", () => {
    // A Node self-host — Railway's Docker runtime — has no Hyperdrive binding.
    delete mockEnv.HYPERDRIVE;
    expect(getPostgresPoolSize()).toBeGreaterThan(1);
  });

  it("treats an empty Hyperdrive binding as no Hyperdrive", () => {
    mockEnv.HYPERDRIVE = { connectionString: "   " };
    expect(getPostgresPoolSize()).toBeGreaterThan(1);
    delete mockEnv.HYPERDRIVE;
  });
});
