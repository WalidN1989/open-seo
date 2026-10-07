import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock("@/server/auth/repositories/ApiKeyRepository", () => ({
  ApiKeyRepository: {
    getForUser: mocks.get,
    updatePermissions: mocks.update,
  },
}));

const { ApiKeyScopeService } = await import("./ApiKeyScopeService");

describe("ApiKeyScopeService", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.update.mockReset();
  });

  it("merges MCP scopes without clobbering other permission namespaces", async () => {
    mocks.get.mockResolvedValue({
      id: "key_1",
      permissions: JSON.stringify({ reports: ["read"], mcpScopes: [] }),
    });
    mocks.update.mockResolvedValue({ id: "key_1" });

    await ApiKeyScopeService.updateMcpScopes("user_1", "key_1", [
      "business:read",
    ]);

    expect(mocks.update).toHaveBeenCalledWith("user_1", "key_1", {
      reports: ["read"],
      mcpScopes: ["business:read"],
      mcpLegacyBusinessAccess: false,
    });
  });
});
