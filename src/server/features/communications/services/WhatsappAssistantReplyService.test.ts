import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConversationReplyState: vi.fn(),
  update: vi.fn(),
  send: vi.fn(),
  verify: vi.fn(),
  generate: vi.fn(),
  queue: vi.fn(),
  getSettings: vi.fn(),
  integration: vi.fn(),
  history: vi.fn(),
  prices: vi.fn(),
  published: vi.fn(),
  project: vi.fn(),
  instant: vi.fn(),
  defaults: vi.fn(),
  key: vi.fn(),
}));
vi.mock("../repositories/WhatsappAssistantRepository", () => ({
  WhatsappAssistantRepository: {
    getConversationReplyState: mocks.getConversationReplyState,
    getSettings: mocks.getSettings,
    latestInboundExternalId: vi.fn(),
    findInstantAnswer: mocks.instant,
    recordAskedQuestion: vi.fn().mockResolvedValue(null),
    listPublishedAnswers: mocks.published,
    projectIdForOrganization: mocks.project,
  },
}));
vi.mock("../repositories/CommunicationsRepository", () => ({
  CommunicationsRepository: {
    updateWhatsappConversation: mocks.update,
    createQueuedWhatsappMessage: mocks.queue,
    completeWhatsappMessage: vi.fn(),
    getIntegrationByProvider: mocks.integration,
    getWhatsappConversationHistory: mocks.history,
  },
}));
vi.mock("@/server/features/clients/services/ClientVerificationService", () => ({
  resolveClientAccess: mocks.verify,
}));
vi.mock("@/server/features/clients/services/ClientDataService", () => ({
  readClientData: vi.fn(),
}));
vi.mock(
  "@/server/features/project-context/services/ProjectContextService",
  () => ({ ProjectContextService: {} }),
);
vi.mock("@/server/lib/runtime-env", () => ({ getOptionalEnvValue: vi.fn() }));
vi.mock("../providers/whatsapp", () => ({ sendWhatsappText: mocks.send }));
vi.mock("../providers/whatsapp-ai", () => ({
  generateWhatsappAiReply: mocks.generate,
}));
vi.mock("./WhatsappAssistantService", () => ({
  WhatsappAssistantService: { withDefaults: mocks.defaults },
  priceTokens: mocks.prices,
  resolveAiKey: mocks.key,
  DEFAULT_HANDOFF_MESSAGE: "Team will help",
}));
import { replyToInbound } from "./WhatsappAssistantReplyService";

const connection: Parameters<typeof replyToInbound>[0] = {
  id: "connection",
  organizationId: "organization",
  provider: "meta_cloud",
  displayPhoneNumber: null,
  phoneNumberId: null,
  businessAccountId: null,
  lastCheckedAt: null,
  lastError: null,
  externalAccountId: null,
  credentialReference: null,
  credentials: null,
  status: "connected",
  createdAt: "2026-10-13T00:00:00Z",
  updatedAt: "2026-10-13T00:00:00Z",
};
const message = (body: string): Parameters<typeof replyToInbound>[2] => ({
  sender: "sender",
  body,
  externalMessageId: "message",
  messageType: "text",
  receivedAt: "2026-10-13T00:00:00Z",
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.integration.mockResolvedValue({ status: "connected" });
  mocks.history.mockResolvedValue([{ direction: "inbound", body: "help" }]);
  mocks.prices.mockResolvedValue([]);
  mocks.published.mockResolvedValue([]);
  mocks.project.mockResolvedValue(null);
  mocks.instant.mockResolvedValue(null);
  mocks.defaults.mockReturnValue({ autopilot: true, replyDelaySeconds: 0 });
  mocks.key.mockResolvedValue("key");
  mocks.getConversationReplyState.mockResolvedValue({
    status: "open",
    replyMode: "auto",
  });
  mocks.verify.mockResolvedValue({ kind: "anonymous" });
  mocks.generate.mockResolvedValue({
    reply: "Hello",
    actions: [],
    ignore: false,
  });
  mocks.queue.mockResolvedValue({ id: "queued" });
  mocks.send.mockResolvedValue({
    status: "sent",
    externalMessageId: "outbound",
  });
});

describe("automatic reply controls", () => {
  it("Manual suppresses verification, model and rule fallback", async () => {
    mocks.getConversationReplyState.mockResolvedValue({
      status: "open",
      replyMode: "manual",
    });
    expect(await replyToInbound(connection, "chat", message("ABCD EFGH"))).toBe(
      true,
    );
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.queue).not.toHaveBeenCalled();
  });
  it("silently persists Manual for money requests before verification", async () => {
    expect(
      await replyToInbound(
        connection,
        "chat",
        message("Please give me some money brother"),
      ),
    ).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith("organization", {
      conversationId: "chat",
      replyMode: "manual",
    });
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("model-detected solicitation suppresses outbound replies and fallback", async () => {
    mocks.generate.mockResolvedValue({ reply: "", actions: [], ignore: true });
    expect(await replyToInbound(connection, "chat", message("help"))).toBe(
      true,
    );
    expect(mocks.update).toHaveBeenCalledWith("organization", {
      conversationId: "chat",
      replyMode: "manual",
    });
    expect(mocks.queue).not.toHaveBeenCalled();
  });
  it("stops a generated response if the operator switches to Manual", async () => {
    mocks.getConversationReplyState
      .mockResolvedValueOnce({ status: "open", replyMode: "auto" })
      .mockResolvedValue({ status: "open", replyMode: "manual" });
    expect(await replyToInbound(connection, "chat", message("help"))).toBe(
      true,
    );
    expect(mocks.generate).toHaveBeenCalled();
    expect(mocks.queue).not.toHaveBeenCalled();
  });
  it("Auto still sends a normal business reply", async () => {
    expect(await replyToInbound(connection, "chat", message("help"))).toBe(
      true,
    );
    expect(mocks.send).toHaveBeenCalledWith(connection, "sender", "Hello");
  });
});
