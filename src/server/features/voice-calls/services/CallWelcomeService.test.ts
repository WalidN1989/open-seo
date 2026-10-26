import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  policy: vi.fn(),
  send: vi.fn(),
  record: vi.fn(),
  chats: vi.fn(),
}));
vi.mock("@/server/features/communications/providers/whatsapp", () => ({
  isWhatsappSandbox: () => false,
  sendWhatsappTemplate: mocks.send,
  sendWhatsappText: mocks.send,
  twilioTemplateText: vi.fn(),
}));
vi.mock(
  "@/server/features/communications/repositories/CommunicationsRepository",
  () => ({
    CommunicationsRepository: { recordAutomatedWhatsapp: mocks.record },
  }),
);
vi.mock("../repositories/PhoneCallRepository", () => ({
  PhoneCallRepository: {
    connectedWhatsapp: async () => ({
      id: "TEST-connection",
      provider: "meta",
    }),
  },
}));
vi.mock(
  "@/server/features/communications/repositories/WhatsappAgentRepository",
  () => ({ WhatsappAgentRepository: { chatsForPhone: mocks.chats } }),
);
vi.mock(
  "@/server/features/communications/services/WhatsappSendPolicyService",
  () => ({ requireWhatsappSendAllowed: mocks.policy }),
);
import { CallWelcomeService } from "./CallWelcomeService";
const input = {
  organizationId: "TEST-workspace",
  recipient: "+61400000000",
  contactId: "TEST-contact",
  template: "approved_welcome",
  variables: {},
  enforceRules: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.chats.mockResolvedValue([{ id: "TEST-chat" }]);
  mocks.policy.mockResolvedValue({});
  mocks.send.mockResolvedValue({
    externalMessageId: "TEST-message",
    status: "sent",
  });
  mocks.record.mockResolvedValue({});
});
describe("selected-workspace post-call WhatsApp safeguards", () => {
  it("checks existing opt-outs and outreach rules before provider dispatch", async () => {
    mocks.policy.mockRejectedValue(new Error("Customer opted out"));
    await expect(CallWelcomeService.sendWelcome(input)).rejects.toThrow(
      "opted out",
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("records an accepted approved template", async () => {
    expect(await CallWelcomeService.sendWelcome(input)).toBe("sent");
    expect(mocks.policy).toHaveBeenCalledWith(
      "TEST-workspace",
      "TEST-chat",
      false,
    );
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.record).toHaveBeenCalledTimes(1);
  });
  it("does not blindly repeat a failed provider request", async () => {
    mocks.send.mockRejectedValue(new Error("Provider response lost"));
    expect(await CallWelcomeService.sendWelcome(input)).toContain("failed");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});
