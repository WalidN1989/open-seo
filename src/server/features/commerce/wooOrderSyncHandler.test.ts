import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  authorized: true,
  configured: "11111111-1111-4111-8111-111111111111",
  sync: vi.fn(),
}));
vi.mock("@/server/lib/internal-secret", () => ({
  authorizedByInternalSecret: async () => state.authorized,
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: async () => state.configured,
}));
vi.mock("./services/WooOrderService", () => ({
  WooOrderService: { sync: state.sync },
}));
import { handleWooOrderSync } from "./wooOrderSyncHandler";
function request(connectionId = state.configured) {
  return new Request("https://app.test/api/internal/woocommerce-orders", {
    method: "POST",
    body: JSON.stringify({ connectionId }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  state.authorized = true;
  state.sync.mockResolvedValue(true);
});
it("refuses unauthenticated, malformed and unlisted connections before any sync or message", async () => {
  state.authorized = false;
  expect((await handleWooOrderSync(request())).status).toBe(401);
  state.authorized = true;
  expect((await handleWooOrderSync(request("invalid"))).status).toBe(400);
  expect(
    (await handleWooOrderSync(request("22222222-2222-4222-8222-222222222222")))
      .status,
  ).toBe(403);
  expect(state.sync).not.toHaveBeenCalled();
});
it("dispatches only the selected connection and rejects disabled/ineligible syncs", async () => {
  expect((await handleWooOrderSync(request())).status).toBe(200);
  expect(state.sync).toHaveBeenCalledExactlyOnceWith(state.configured);
  state.sync.mockResolvedValue(false);
  expect((await handleWooOrderSync(request())).status).toBe(404);
  expect(
    (
      await handleWooOrderSync(
        new Request("https://app.test/api/internal/woocommerce-orders"),
      )
    ).status,
  ).toBe(405);
});
