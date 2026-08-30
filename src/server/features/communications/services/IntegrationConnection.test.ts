import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  createIntegration: vi.fn(),
  getIntegration: vi.fn(),
  updateIntegration: vi.fn(),
  deleteIntegration: vi.fn(),
  record: vi.fn(),
}));

vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({
    BusinessModuleService: { requireAccess: mocks.requireAccess },
  }),
);
vi.mock("../repositories/CommunicationsRepository", () => ({
  CommunicationsRepository: {
    createIntegration: mocks.createIntegration,
    getIntegration: mocks.getIntegration,
    updateIntegration: mocks.updateIntegration,
    deleteIntegration: mocks.deleteIntegration,
  },
}));
vi.mock(
  "@/server/features/business-modules/repositories/BusinessAuditRepository",
  () => ({ BusinessAuditRepository: { record: mocks.record } }),
);
// The service reaches provider credentials through runtime-env, which pulls in
// the Cloudflare Workers env binding. None of that is under test here.
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: vi.fn(() => undefined),
}));
vi.mock(
  "@/server/features/business-modules/repositories/BusinessModuleRepository",
  () => ({ BusinessModuleRepository: {} }),
);

const { CommunicationsService } = await import("./CommunicationsService");

const ORG = "org_1";
const USER = "user_1";
const CONNECTION = "connection_1";

function connection(overrides: Record<string, unknown> = {}) {
  return {
    id: CONNECTION,
    organizationId: ORG,
    providerKey: "woocommerce",
    displayName: "BooXworm",
    credentialReference: "BOOXWORM",
    status: "disconnected",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAccess.mockResolvedValue(undefined);
  mocks.getIntegration.mockResolvedValue(connection());
});

describe("integration connection authorization", () => {
  it("refuses to update a connection without admin access", async () => {
    mocks.requireAccess.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(
      CommunicationsService.updateIntegration(ORG, USER, {
        connectionId: CONNECTION,
        displayName: "BooXworm",
        credentialReference: "BOOXWORM",
      }),
    ).rejects.toThrow("FORBIDDEN");
    expect(mocks.updateIntegration).not.toHaveBeenCalled();
  });

  it("refuses to delete a connection without admin access", async () => {
    mocks.requireAccess.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(
      CommunicationsService.deleteIntegration(ORG, USER, {
        connectionId: CONNECTION,
      }),
    ).rejects.toThrow("FORBIDDEN");
    expect(mocks.deleteIntegration).not.toHaveBeenCalled();
  });

  it("requires admin, not merely manage, to change credentials", async () => {
    mocks.updateIntegration.mockResolvedValue(connection());
    await CommunicationsService.updateIntegration(ORG, USER, {
      connectionId: CONNECTION,
      displayName: "BooXworm",
      credentialReference: "BOOXWORM",
    });
    expect(mocks.requireAccess).toHaveBeenCalledWith(
      ORG,
      USER,
      "integrations",
      "admin",
    );
  });
});

describe("integration connection organization isolation", () => {
  it("scopes the update to the caller's organization", async () => {
    mocks.updateIntegration.mockResolvedValue(connection());
    await CommunicationsService.updateIntegration(ORG, USER, {
      connectionId: CONNECTION,
      displayName: "Renamed",
      credentialReference: "BOOXWORM",
    });
    expect(mocks.updateIntegration).toHaveBeenCalledWith(
      ORG,
      CONNECTION,
      expect.objectContaining({ displayName: "Renamed" }),
    );
  });

  it("scopes the delete to the caller's organization", async () => {
    mocks.deleteIntegration.mockResolvedValue(connection());
    await CommunicationsService.deleteIntegration(ORG, USER, {
      connectionId: CONNECTION,
    });
    expect(mocks.deleteIntegration).toHaveBeenCalledWith(ORG, CONNECTION);
  });

  it("reports a connection owned by another organization as not found", async () => {
    // The repository filters on organization, so another tenant's id returns
    // no row. That must surface as an error, never as a silent success.
    mocks.getIntegration.mockResolvedValue(undefined);
    mocks.updateIntegration.mockResolvedValue(undefined);
    await expect(
      CommunicationsService.updateIntegration(ORG, USER, {
        connectionId: "connection_from_another_org",
        displayName: "Nope",
      }),
    ).rejects.toThrow("Integration connection not found.");
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("does not audit a delete that matched no row", async () => {
    mocks.deleteIntegration.mockResolvedValue(undefined);
    await expect(
      CommunicationsService.deleteIntegration(ORG, USER, {
        connectionId: "connection_from_another_org",
      }),
    ).rejects.toThrow("Integration connection not found.");
    expect(mocks.record).not.toHaveBeenCalled();
  });
});

describe("integration connection audit trail", () => {
  it("records who changed a credential reference", async () => {
    mocks.updateIntegration.mockResolvedValue(connection());
    await CommunicationsService.updateIntegration(ORG, USER, {
      connectionId: CONNECTION,
      displayName: "BooXworm",
      credentialReference: "BOOXWORM",
    });
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        actorUserId: USER,
        action: "integration.updated",
        targetId: CONNECTION,
      }),
    );
  });

  it("records who removed a connection", async () => {
    mocks.deleteIntegration.mockResolvedValue(connection());
    const result = await CommunicationsService.deleteIntegration(ORG, USER, {
      connectionId: CONNECTION,
    });
    expect(result).toEqual({ id: CONNECTION });
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "integration.deleted" }),
    );
  });
});
