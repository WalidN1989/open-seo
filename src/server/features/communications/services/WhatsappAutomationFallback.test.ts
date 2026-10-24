import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  rules: vi.fn(),
  template: vi.fn(),
  queue: vi.fn(),
  send: vi.fn(),
  complete: vi.fn(),
  claim: vi.fn(),
}));
vi.mock("../repositories/WhatsappReplyControlRepository", () => ({
  WhatsappReplyControlRepository: {
    isCurrent: mocks.state,
    claimDispatch: mocks.claim,
  },
}));
vi.mock("../repositories/CommunicationsRepository", () => ({
  CommunicationsRepository: {
    listMatchingWhatsappAutomations: mocks.rules,
    getWhatsappTemplate: mocks.template,
    createQueuedWhatsappMessage: mocks.queue,
    completeWhatsappMessage: mocks.complete,
  },
}));
vi.mock("../providers/whatsapp", () => ({ sendWhatsappText: mocks.send }));
import { runWhatsappAutomationFallback } from "./WhatsappAutomationFallback";
const connection = {
  id: "connection",
  organizationId: "organization",
  provider: "meta_cloud",
  displayPhoneNumber: null,
  externalAccountId: null,
  credentialReference: null,
};
beforeEach(() => {
  mocks.claim.mockImplementation(async (input) => {
    mocks.queue(input);
    return { id: "queued" };
  });
  mocks.rules.mockResolvedValue([{ responseTemplateId: "template" }]);
  mocks.template.mockResolvedValue({ body: "Business reply" });
  mocks.queue.mockResolvedValue({ id: "queued" });
  mocks.send.mockResolvedValue({ externalMessageId: "sent", status: "sent" });
});
it.each(["manual", "auto"])(
  "fallback templates obey persisted %s mode",
  async (replyMode) => {
    mocks.state.mockResolvedValue(replyMode === "auto");
    await runWhatsappAutomationFallback(
      connection,
      "chat",
      "sender",
      "pricing",
      { isNew: false, revision: 0, messageId: "inbound" },
    );
    expect(mocks.state).toHaveBeenCalledWith("organization", "chat", 0);
    expect(mocks.send).toHaveBeenCalledTimes(replyMode === "auto" ? 1 : 0);
  },
);
it("keeps a handed-off conversation silent", async () => {
  mocks.state.mockResolvedValue(false);
  await runWhatsappAutomationFallback(connection, "chat", "sender", "pricing", {
    isNew: false,
    revision: 0,
    messageId: "inbound",
  });
  expect(mocks.queue).not.toHaveBeenCalled();
});

it("suppresses fallback after Manual to Auto changes the captured revision", async () => {
  mocks.state.mockResolvedValueOnce(true).mockResolvedValue(false);
  await runWhatsappAutomationFallback(connection, "chat", "sender", "pricing", {
    isNew: false,
    revision: 0,
    messageId: "old",
  });
  expect(mocks.claim).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});
it("does not dispatch if the atomic claim loses to Manual", async () => {
  mocks.state.mockResolvedValue(true);
  mocks.claim.mockResolvedValueOnce(null);
  await runWhatsappAutomationFallback(connection, "chat", "sender", "pricing", {
    isNew: false,
    revision: 0,
    messageId: "old",
  });
  expect(mocks.send).not.toHaveBeenCalled();
});
