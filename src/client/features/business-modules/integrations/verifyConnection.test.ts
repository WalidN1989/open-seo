import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkIntegrationHealth: vi.fn(),
  testIntegration: vi.fn(),
}));

vi.mock("@/serverFunctions/commerce", () => ({
  checkIntegrationHealth: mocks.checkIntegrationHealth,
}));
vi.mock("@/serverFunctions/communications", () => ({
  testIntegration: mocks.testIntegration,
}));

const { verifyConnection } = await import("./verifyConnection");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("verifying an integration connection", () => {
  // The bug this guards: every provider went through the catalogue health
  // check, which raises VALIDATION_ERROR for anything that is not a store.
  // Firecrawl then reported "Please check your input and try again" — which
  // reads as a rejected API key rather than a question never asked about it.
  it("tests a non-catalogue provider through the provider test, not catalogue health", async () => {
    mocks.testIntegration.mockResolvedValue({
      providerKey: "firecrawl",
      detail: "Firecrawl account authenticated",
    });

    const result = await verifyConnection({
      connectionId: "conn_1",
      supportsCatalogueSync: false,
    });

    expect(result).toEqual({
      ok: true,
      detail: "Firecrawl account authenticated",
    });
    expect(mocks.checkIntegrationHealth).not.toHaveBeenCalled();
  });

  it("uses catalogue health for a store, so the product count is reported", async () => {
    mocks.checkIntegrationHealth.mockResolvedValue({
      status: "connected",
      healthDetail: "461 products found in your store",
    });

    const result = await verifyConnection({
      connectionId: "conn_2",
      supportsCatalogueSync: true,
    });

    expect(result).toEqual({
      ok: true,
      detail: "461 products found in your store",
    });
    expect(mocks.testIntegration).not.toHaveBeenCalled();
  });

  it("reports a store whose credentials did not work as a failure", async () => {
    mocks.checkIntegrationHealth.mockResolvedValue({
      status: "error",
      healthDetail: "Shopify responded 401",
    });

    await expect(
      verifyConnection({ connectionId: "conn_3", supportsCatalogueSync: true }),
    ).resolves.toEqual({ ok: false, detail: "Shopify responded 401" });
  });

  it("turns a thrown provider error into a readable failure", async () => {
    mocks.testIntegration.mockRejectedValue(new Error("UPSTREAM_UNAVAILABLE"));

    const result = await verifyConnection({
      connectionId: "conn_4",
      supportsCatalogueSync: false,
    });

    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/temporarily unavailable/i);
  });
});
