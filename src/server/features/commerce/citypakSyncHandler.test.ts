import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  authorized: true,
  configured: "11111111-1111-4111-8111-111111111111",
  connection: vi.fn(),
  run: vi.fn(),
  tracking: vi.fn(),
  messages: vi.fn(),
}));
vi.mock("@/server/lib/internal-secret", () => ({
  authorizedByInternalSecret: async () => state.authorized,
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: async () => state.configured,
}));
vi.mock("./repositories/CitypakRepository", () => ({
  CitypakRepository: { connection: state.connection },
}));
vi.mock("./services/OrderOperationsService", () => ({
  OrderOperationsService: { runDue: state.run },
}));
vi.mock("./services/OrderShipmentService", () => ({
  OrderShipmentService: { runDueTracking: state.tracking },
}));
vi.mock("./services/ShipmentMessagesService", () => ({
  ShipmentMessagesService: { runDue: state.messages },
}));
import { handleCitypakSync } from "./citypakSyncHandler";
function request(connectionId = state.configured) {
  return new Request("https://app.test/api/internal/citypak-sync", {
    method: "POST",
    body: JSON.stringify({ connectionId }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  state.authorized = true;
  state.connection.mockResolvedValue({});
});
it("rejects unauthenticated and unlisted connections before touching courier data", async () => {
  state.authorized = false;
  expect((await handleCitypakSync(request())).status).toBe(401);
  state.authorized = true;
  expect(
    (await handleCitypakSync(request("22222222-2222-4222-8222-222222222222")))
      .status,
  ).toBe(403);
  expect(state.connection).not.toHaveBeenCalled();
  expect(state.run).not.toHaveBeenCalled();
});
it("runs only the selected active connection's courier operations and tracking", async () => {
  expect((await handleCitypakSync(request())).status).toBe(200);
  expect(state.run).toHaveBeenCalledExactlyOnceWith(state.configured);
  expect(state.tracking).toHaveBeenCalledExactlyOnceWith(state.configured);
  expect(state.messages).toHaveBeenCalledExactlyOnceWith(state.configured);
  state.connection.mockResolvedValue(null);
  expect((await handleCitypakSync(request())).status).toBe(404);
  expect(state.run).toHaveBeenCalledTimes(1);
});
