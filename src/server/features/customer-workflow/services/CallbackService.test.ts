import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PhoneCallReport } from "@/server/features/voice-calls/elevenlabsWebhook";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  update: vi.fn(),
  activity: vi.fn(),
  complete: vi.fn(),
}));
vi.mock("../repositories/ActionRepository", () => ({
  ActionRepository: {
    callbackFor: mocks.request,
    completeCallback: mocks.complete,
  },
}));
vi.mock("@/server/features/crm/services/CrmService", () => ({
  CrmService: { updateContact: mocks.update, createActivity: mocks.activity },
}));
vi.mock("@/server/features/crm/repositories/LeadDetailRepository", () => ({
  LeadDetailRepository: {
    getLead: async () => ({ contact: { id: "TEST-contact" } }),
  },
}));
vi.mock(
  "@/server/features/communications/repositories/CommunicationsRepository",
  () => ({ CommunicationsRepository: {} }),
);
vi.mock("@/server/lib/connection-secrets", () => ({
  resolveConnectionCredential: vi.fn(),
}));
import { CallbackService } from "./CallbackService";
const report: PhoneCallReport = {
  conversationId: "TEST-conversation",
  agentId: null,
  agentName: null,
  direction: "outbound",
  callerNumber: null,
  calledNumber: "+61400000000",
  startedAt: null,
  durationSeconds: 30,
  summary: "TEST email correction",
  callSuccessful: "success",
  captured: {
    caller_email: "corrected@example.invalid",
    email_confirmed: "yes",
  },
  transcript: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.request.mockResolvedValue({
    id: "TEST-approval",
    approvedByUserId: "TEST-owner",
    resultJson: '{"status":"initiated"}',
    requestJson: JSON.stringify({
      action: {
        kind: "callback",
        leadId: "TEST-lead",
        phone: "+61400000000",
        reason: "TEST correction",
      },
    }),
  });
});
describe("approved callback contact correction", () => {
  it("updates only after an exact approved conversation, destination and explicit confirmation", async () => {
    await CallbackService.complete("TEST-workspace", report);
    expect(mocks.request).toHaveBeenCalledWith(
      "TEST-workspace",
      "TEST-conversation",
    );
    expect(mocks.update).toHaveBeenCalledWith("TEST-workspace", "TEST-owner", {
      id: "TEST-contact",
      email: "corrected@example.invalid",
    });
    expect(mocks.complete.mock.calls[0]?.[2]).toContain("contact_corrected");
  });
  it("cannot correct an unrelated or unapproved callback", async () => {
    await CallbackService.complete("TEST-workspace", {
      ...report,
      calledNumber: "+61411111111",
    });
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.request.mockResolvedValue(null);
    await CallbackService.complete("TEST-workspace", report);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("keeps unconfirmed email and failed calls on the attention list", async () => {
    await CallbackService.complete("TEST-workspace", {
      ...report,
      captured: { ...report.captured, email_confirmed: "no" },
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.complete.mock.calls[0]?.[2]).toContain("needs_attention");
  });
  it("does not repeat a completed correction on webhook replay", async () => {
    mocks.request.mockResolvedValue({
      approvedByUserId: "TEST-owner",
      resultJson: '{"status":"contact_corrected"}',
    });
    await CallbackService.complete("TEST-workspace", report);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
