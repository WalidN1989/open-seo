import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  rules: vi.fn(),
  template: vi.fn(),
  queue: vi.fn(),
  send: vi.fn(),
  complete: vi.fn(),
}));
vi.mock("../repositories/WhatsappAssistantRepository", () => ({
  WhatsappAssistantRepository: { getConversationReplyState: mocks.state },
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
  mocks.rules.mockResolvedValue([{ responseTemplateId: "template" }]);
  mocks.template.mockResolvedValue({ body: "Business reply" });
  mocks.queue.mockResolvedValue({ id: "queued" });
  mocks.send.mockResolvedValue({ externalMessageId: "sent", status: "sent" });
});
it.each(["manual", "auto"])(
  "fallback templates obey persisted %s mode",
  async (replyMode) => {
    mocks.state.mockResolvedValue({ status: "open", replyMode });
    await runWhatsappAutomationFallback(
      connection,
      "chat",
      "sender",
      "pricing",
      false,
    );
    expect(mocks.state).toHaveBeenCalledWith("organization", "chat");
    expect(mocks.send).toHaveBeenCalledTimes(replyMode === "auto" ? 1 : 0);
  },
);
it("keeps a handed-off conversation silent", async () => {
  mocks.state.mockResolvedValue({ status: "pending", replyMode: "auto" });
  await runWhatsappAutomationFallback(
    connection,
    "chat",
    "sender",
    "pricing",
    false,
  );
  expect(mocks.queue).not.toHaveBeenCalled();
});
