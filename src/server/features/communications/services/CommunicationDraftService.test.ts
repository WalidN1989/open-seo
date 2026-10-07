import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  canonicalRecipient: vi.fn(),
  getPending: vi.fn(),
  list: vi.fn(),
  requireAccess: vi.fn(),
  transitionStatus: vi.fn(),
}));
vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({
    BusinessModuleService: { requireAccess: mocks.requireAccess },
  }),
);
vi.mock("../repositories/CommunicationDraftRepository", () => ({
  CommunicationDraftRepository: {
    create: mocks.create,
    canonicalRecipient: mocks.canonicalRecipient,
    getPending: mocks.getPending,
    listPending: mocks.list,
    transitionStatus: mocks.transitionStatus,
  },
}));

const { CommunicationDraftService } =
  await import("./CommunicationDraftService");

describe("CommunicationDraftService", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.requireAccess.mockResolvedValue(undefined);
  });

  it("claims a draft with compare-and-set before approval", async () => {
    const draft = {
      id: "draft_1",
      organizationId: "org_1",
      channel: "sms",
      recipient: "+61400000000",
      body: "Hello",
      status: "draft",
    };
    mocks.getPending.mockResolvedValue(draft);
    mocks.transitionStatus.mockResolvedValue({
      ...draft,
      status: "sending",
    });

    await expect(
      CommunicationDraftService.claimForApproval("org_1", "user_1", "draft_1"),
    ).resolves.toMatchObject({ status: "sending" });
    expect(mocks.transitionStatus).toHaveBeenCalledWith(
      "org_1",
      "draft_1",
      "draft",
      "sending",
    );
  });

  it("saves an unsent draft and makes it available to the app workspace", async () => {
    const draft = {
      id: "draft_1",
      organizationId: "org_1",
      channel: "sms",
      recipient: "+61400000000",
      body: "Hello",
      status: "draft",
    };
    mocks.create.mockResolvedValue(draft);
    mocks.list.mockResolvedValue([draft]);

    await CommunicationDraftService.save("org_1", "user_1", {
      channel: "sms",
      recipient: draft.recipient,
      body: draft.body,
    });
    await expect(
      CommunicationDraftService.listPending("org_1", "user_1", "sms"),
    ).resolves.toEqual([draft]);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ authoredBy: "user_1" }),
    );
  });
});
