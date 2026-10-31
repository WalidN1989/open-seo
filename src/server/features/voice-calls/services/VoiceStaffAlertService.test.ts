import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PhoneCallReport } from "../elevenlabsWebhook";
vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: async () => "https://du.example",
}));
const m = vi.hoisted(() => ({
  staff: vi.fn(),
  sender: vi.fn(),
  chat: vi.fn(),
  recent: vi.fn(),
  pending: vi.fn(),
  ensure: vi.fn(),
  claim: vi.fn(),
  finish: vi.fn(),
  modules: vi.fn(),
  route: vi.fn(),
  inbound: vi.fn(),
  config: vi.fn(),
  template: vi.fn(),
  text: vi.fn(),
  sendTemplate: vi.fn(),
  record: vi.fn(),
  update: vi.fn(),
}));
vi.mock("../repositories/VoiceStaffAlertRepository", () => ({
  VoiceStaffAlertRepository: {
    sender: m.sender,
    staffChat: m.chat,
    recentCalls: m.recent,
    pending: m.pending,
  },
}));
vi.mock(
  "@/server/features/customer-workflow/repositories/ActionRepository",
  () => ({
    ActionRepository: {
      ensure: m.ensure,
      transition: m.claim,
      finish: m.finish,
    },
  }),
);
vi.mock(
  "@/server/features/business-modules/repositories/BusinessModuleRepository",
  () => ({ BusinessModuleRepository: { listEntitlements: m.modules } }),
);
vi.mock(
  "@/server/features/communications/repositories/WhatsappHandoffRepository",
  () => ({ WhatsappHandoffRepository: { listContacts: m.staff } }),
);
vi.mock(
  "@/server/features/communications/repositories/WhatsappHandoffOutboxRepository",
  () => ({ WhatsappHandoffOutboxRepository: { lastInboundAt: m.inbound } }),
);
vi.mock(
  "@/server/features/communications/repositories/CommunicationsRepository",
  () => ({
    CommunicationsRepository: {
      getWhatsappConversationForSend: m.route,
      recordAutomatedWhatsapp: m.record,
      updateWhatsappConversation: m.update,
    },
  }),
);
vi.mock(
  "@/server/features/communications/repositories/WhatsappAssistantRepository",
  () => ({ WhatsappAssistantRepository: { getSettings: m.config } }),
);
vi.mock("@/server/features/communications/providers/twilioContent", () => ({
  fetchHandoffTemplate: m.template,
}));
vi.mock("@/server/features/communications/providers/whatsapp", () => ({
  sendWhatsappText: m.text,
  sendWhatsappTemplate: m.sendTemplate,
}));
import { VoiceStaffAlertService as service } from "./VoiceStaffAlertService";
const report = (captured: Record<string, string> = {}): PhoneCallReport => ({
  conversationId: "provider-call",
  agentId: "agent",
  agentName: "Bookshop",
  direction: "inbound",
  callerNumber: "+94770000001",
  calledNumber: "+94110000000",
  startedAt: new Date().toISOString(),
  durationSeconds: 30,
  summary: "Order delivery unresolved",
  callSuccessful: "failure",
  captured,
  transcript: [],
});
const run = (
  captured: Record<string, string> = {
    staff_handoff_required: "true",
    staff_handoff_reason: "Customer called again about order TEST-1",
  },
) => service.afterCall("org", "call", report(captured));
beforeEach(() => {
  vi.resetAllMocks();
  m.modules.mockResolvedValue([
    { moduleKey: "voice", status: "enabled" },
    { moduleKey: "whatsapp", status: "enabled" },
  ]);
  m.staff.mockResolvedValue([
    { id: "staff", name: "Staff", phone: "+94770000002" },
  ]);
  m.sender.mockResolvedValue({
    id: "sender",
    displayPhoneNumber: "+94770000003",
  });
  m.chat.mockResolvedValue({ id: "staff-chat" });
  m.recent.mockResolvedValue([]);
  m.ensure.mockResolvedValue({ id: "action" });
  m.pending.mockResolvedValue([
    {
      id: "action",
      requestJson: JSON.stringify({
        body: "Customer order TEST-1 needs review",
        caller: "+94770000001",
        reason: "Repeat order enquiry",
      }),
    },
  ]);
  m.route.mockResolvedValue({
    connection: {
      id: "sender",
      organizationId: "org",
      provider: "twilio",
      status: "connected",
      displayPhoneNumber: "+94770000003",
    },
    conversation: {
      id: "staff-chat",
      externalConversationId: "+94770000002",
      optedOutAt: null,
    },
  });
  m.inbound.mockResolvedValue(new Date().toISOString());
  m.claim.mockResolvedValue({ id: "action" });
  m.text.mockResolvedValue({
    externalMessageId: "provider-message",
    status: "queued",
  });
  m.sendTemplate.mockResolvedValue({
    externalMessageId: "provider-template",
    status: "queued",
  });
  m.config.mockResolvedValue(null);
});
describe("private voice staff alerts", () => {
  it("links a durable claim to the call and staff chat, and sends only to configured staff", async () => {
    await run();
    expect(m.ensure).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "call",
        organizationId: "org",
        whatsappConversationId: "staff-chat",
        kind: "system_voice_staff_alert",
      }),
    );
    expect(m.text).toHaveBeenCalledWith(
      expect.anything(),
      "+94770000002",
      expect.stringContaining("TEST-1"),
      expect.any(Function),
      { statusCallbackUrl: "https://du.example/api/whatsapp/sender" },
    );
    expect(m.finish).toHaveBeenCalledWith(
      "org",
      "action",
      expect.objectContaining({ status: "completed" }),
    );
  });
  it("keeps closed-window alerts pending until the staff member messages", async () => {
    m.inbound.mockResolvedValue(null);
    await run();
    expect(m.claim).not.toHaveBeenCalled();
    expect(m.text).not.toHaveBeenCalled();
    m.inbound.mockResolvedValue(new Date().toISOString());
    expect(
      await service.staffInbound("org", "staff-chat", "+94770000002"),
    ).toBe(true);
    expect(m.update).toHaveBeenCalledWith("org", {
      conversationId: "staff-chat",
      replyMode: "manual",
    });
    expect(m.text).toHaveBeenCalledTimes(1);
  });
  it("never sends to a removed staff destination or an opted-out chat", async () => {
    m.staff
      .mockResolvedValueOnce([{ id: "staff", phone: "+94770000002" }])
      .mockResolvedValue([]);
    await run();
    expect(m.text).not.toHaveBeenCalled();
  });
  it("does not treat other tenants' customers as staff", async () => {
    m.staff.mockResolvedValue([]);
    expect(
      await service.staffInbound("other-org", "chat", "+94770000002"),
    ).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("leaves concurrent claims and uncertain provider outcomes for review without retrying", async () => {
    m.claim.mockResolvedValue(null);
    await run();
    expect(m.text).not.toHaveBeenCalled();
    m.claim.mockResolvedValue({ id: "action" });
    m.text.mockRejectedValue(new Error("timeout"));
    await run();
    expect(m.text).toHaveBeenCalledTimes(1);
    expect(m.finish).toHaveBeenCalledWith(
      "org",
      "action",
      expect.objectContaining({ status: "attention" }),
    );
  });
  it("does not alert for resolved calls, greetings, disabled modules or outbound calls", async () => {
    await run({
      staff_handoff_required: "false",
      staff_handoff_reason: "",
      inquiry_type: "general_info",
    });
    await service.afterCall("org", "call", {
      ...report(),
      direction: "outbound",
    });
    m.modules.mockResolvedValue([]);
    await run();
    expect(m.ensure).not.toHaveBeenCalled();
  });
  it("finds repeat order callers from stored scoped history without inventing an order match", async () => {
    m.recent.mockResolvedValue([
      { capturedJson: '{"inquiry_type":"order_tracking"}' },
      { capturedJson: '{"inquiry_type":"order_tracking"}' },
    ]);
    await run({
      inquiry_type: "order_tracking",
      staff_handoff_reason: "",
      staff_handoff_required: "",
    });
    expect(m.recent).toHaveBeenCalledWith("org", "+94770000001");
    expect(m.ensure).toHaveBeenCalled();
  });
  it("uses only a freshly approved template outside the reply window", async () => {
    m.inbound.mockResolvedValue(null);
    m.config.mockResolvedValue({ handoffContentSid: "approved-template" });
    m.template.mockRejectedValue(new Error("not approved"));
    await run();
    expect(m.sendTemplate).not.toHaveBeenCalled();
    m.template.mockResolvedValue({
      name: "staff_alert",
      externalTemplateId: "approved-template",
      languageCode: "en",
    });
    await run();
    expect(m.sendTemplate).toHaveBeenCalledTimes(1);
    expect(m.text).not.toHaveBeenCalled();
  });
  it("rechecks staff revocation after a slow approval lookup before sending customer details", async () => {
    m.inbound.mockResolvedValue(null);
    m.config.mockResolvedValue({ handoffContentSid: "approved-template" });
    m.template.mockImplementation(async () => {
      m.staff.mockResolvedValue([]);
      return {
        name: "staff_alert",
        externalTemplateId: "approved-template",
        languageCode: "en",
      };
    });
    await run();
    expect(m.sendTemplate).not.toHaveBeenCalled();
    expect(m.finish).toHaveBeenCalledWith(
      "org",
      "action",
      expect.objectContaining({ status: "attention" }),
    );
  });
});
