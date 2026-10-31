import { beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  claim: vi.fn(),
  finish: vi.fn(),
  getChat: vi.fn(),
  allowed: vi.fn(),
  reply: vi.fn(),
  template: vi.fn(),
  audit: vi.fn(),
}));
vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({ BusinessModuleService: { requireAccess: mocks.access } }),
);
vi.mock(
  "@/server/features/business-modules/repositories/BusinessAuditRepository",
  () => ({ BusinessAuditRepository: { record: mocks.audit } }),
);
vi.mock("../repositories/WhatsappOrderRequestRepository", () => ({
  WhatsappOrderRequestRepository: {
    get: mocks.get,
    update: mocks.update,
    claim: mocks.claim,
    finish: mocks.finish,
  },
}));
vi.mock("./WhatsappAgentService", () => ({
  WhatsappAgentService: {
    getChat: mocks.getChat,
    requireAllowed: mocks.allowed,
    sendReply: mocks.reply,
    sendTemplate: mocks.template,
  },
}));
const { WhatsappOrderRequestService: service } =
  await import("./WhatsappOrderRequestService");
const request = {
  id: "r1",
  conversationId: "c1",
  customerPhone: "+61400000001",
  status: "available",
  summary: "Blue Book",
};
beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.get.mockResolvedValue(request);
  mocks.getChat.mockResolvedValue({
    chat: { lastInboundAt: new Date().toISOString() },
    templates: [
      {
        id: "utility",
        name: "utility",
        category: "utility",
        body: "Your {{1}} has arrived.",
      },
      {
        id: "marketing",
        name: "marketing",
        category: "marketing",
        body: "Buy now",
      },
    ],
  });
  mocks.claim.mockResolvedValue(request);
  mocks.reply.mockResolvedValue({ id: "m1" });
  mocks.template.mockResolvedValue({ id: "m2" });
});
it("uses the original linked chat and guarded reply path; records Notified only after acceptance", async () => {
  await service.notify("org", "staff", {
    requestId: "r1",
    body: "Item arrived",
  });
  expect(mocks.access).toHaveBeenCalledWith(
    "org",
    "staff",
    "whatsapp",
    "manage",
  );
  expect(mocks.allowed).toHaveBeenCalledWith("org", "c1", true);
  expect(mocks.reply).toHaveBeenCalledWith("org", "staff", {
    conversationId: "c1",
    body: "Item arrived",
  });
  expect(mocks.finish).toHaveBeenCalledWith("org", "r1", "m1");
});
it("does not claim or send after access denial", async () => {
  mocks.access.mockRejectedValue(new Error("Forbidden"));
  await expect(
    service.notify("org", "staff", { requestId: "r1", body: "Item arrived" }),
  ).rejects.toThrow("Forbidden");
  expect(mocks.claim).not.toHaveBeenCalled();
});
it("refuses foreign or unlinked requests", async () => {
  mocks.get.mockResolvedValue(null);
  await expect(service.preview("org", "staff", "foreign")).rejects.toThrow(
    /no linked/,
  );
  expect(mocks.reply).not.toHaveBeenCalled();
});
it("allows only Available items and never repeats a claimed notification", async () => {
  mocks.get.mockResolvedValue({ ...request, status: "requested" });
  await expect(
    service.notify("org", "staff", { requestId: "r1", body: "Arrived" }),
  ).rejects.toThrow(/Available/);
  mocks.get.mockResolvedValue(request);
  mocks.claim.mockResolvedValue(null);
  await expect(
    service.notify("org", "staff", { requestId: "r1", body: "Arrived" }),
  ).rejects.toThrow(/already notified/);
  expect(mocks.reply).not.toHaveBeenCalled();
});
it("honors window, opt-out and follow-up rule failures before claiming", async () => {
  mocks.allowed.mockRejectedValue(
    new Error("Only an approved template is allowed"),
  );
  await expect(
    service.notify("org", "staff", { requestId: "r1", body: "Arrived" }),
  ).rejects.toThrow(/approved template/);
  expect(mocks.claim).not.toHaveBeenCalled();
});
it("sends an approved utility template with exactly the reviewed variables", async () => {
  await service.notify("org", "staff", {
    requestId: "r1",
    body: "Your Blue Book has arrived.",
    templateId: "utility",
    variables: { "1": "Blue Book" },
  });
  expect(mocks.allowed).toHaveBeenCalledWith("org", "c1", false);
  expect(mocks.template).toHaveBeenCalledWith("org", "staff", {
    conversationId: "c1",
    templateId: "utility",
    variables: { "1": "Blue Book" },
  });
  expect(mocks.finish).toHaveBeenCalledWith("org", "r1", "m2");
});
it("rejects marketing templates, unfilled variables and a misleading preview", async () => {
  for (const input of [
    { templateId: "marketing", body: "Buy now" },
    { templateId: "utility", body: "Your {{1}} has arrived." },
    {
      templateId: "utility",
      body: "Wrong preview",
      variables: { "1": "Blue Book" },
    },
  ])
    await expect(
      service.notify("org", "staff", { requestId: "r1", ...input }),
    ).rejects.toThrow();
  expect(mocks.claim).not.toHaveBeenCalled();
});
it("records an unknown outcome on timeout, without allowing an automatic second send", async () => {
  mocks.reply.mockRejectedValue(new Error("Timeout after provider accepted"));
  await expect(
    service.notify("org", "staff", { requestId: "r1", body: "Arrived" }),
  ).rejects.toThrow(/outcome needs checking/);
  expect(mocks.finish).toHaveBeenCalledWith("org", "r1", null);
  expect(mocks.audit).not.toHaveBeenCalled();
});
it("refuses status/date changes once a notification has started", async () => {
  mocks.update.mockResolvedValue(null);
  await expect(
    service.update("org", "staff", { requestId: "r1", status: "requested" }),
  ).rejects.toThrow(/notification already started/);
});
it("does not mark a provider-rejected message Notified", async () => {
  mocks.reply.mockResolvedValue({ id: "m1", status: "failed" });
  await expect(
    service.notify("org", "staff", { requestId: "r1", body: "Arrived" }),
  ).rejects.toThrow(/outcome needs checking/);
  expect(mocks.finish).toHaveBeenCalledWith("org", "r1", null);
});

const availability = {
  id: "available-template",
  name: "shop_item_available",
  category: "utility",
  body: "Your {{1}} is available.",
  externalTemplateId: "HX-synthetic",
};
it("defaults to the single approved availability template and the requested item", async () => {
  mocks.getChat.mockResolvedValue({
    chat: { lastInboundAt: "2026-10-01T00:00:00Z" },
    templates: [availability],
  });
  const preview = await service.preview("org", "staff", "r1");
  expect(preview.defaultTemplateId).toBe(availability.id);
  expect(preview.defaultVariables).toEqual({ "1": "Blue Book" });
  expect(preview.sendBlockedReason).toBeNull();
  expect(preview.windowOpen).toBe(false);
  expect(mocks.claim).not.toHaveBeenCalled();
  expect(mocks.template).not.toHaveBeenCalled();
});
it("does not guess an availability template when the choice is ambiguous or incompatible", async () => {
  for (const templates of [
    [
      availability,
      { ...availability, id: "other-language", languageCode: "si" },
    ],
    [{ ...availability, body: "Your {{1}} has arrived for order {{2}}." }],
    [{ ...availability, externalTemplateId: null }],
    [{ ...availability, category: "marketing" }],
  ]) {
    mocks.getChat.mockResolvedValue({
      chat: { lastInboundAt: null },
      templates,
    });
    const preview = await service.preview("org", "staff", "r1");
    expect(preview.defaultTemplateId).toBe("");
    expect(preview.defaultVariables).toEqual({});
  }
});
it("reports policy restrictions in the preview without claiming or sending", async () => {
  mocks.allowed.mockRejectedValue(
    new AppError(
      "VALIDATION_ERROR",
      "Follow-ups are restricted to business hours.",
    ),
  );
  const preview = await service.preview("org", "staff", "r1");
  expect(preview.sendBlockedReason).toBe(
    "Follow-ups are restricted to business hours.",
  );
  await expect(
    service.notify("org", "staff", { requestId: "r1", body: "Arrived" }),
  ).rejects.toThrow(/business hours/);
  expect(mocks.claim).not.toHaveBeenCalled();
});
it("cannot preview an already started send as ready or hide an unexpected preflight error", async () => {
  mocks.get.mockResolvedValue({ ...request, notificationState: "unknown" });
  expect(
    (await service.preview("org", "staff", "r1")).sendBlockedReason,
  ).toMatch(/history/);
  mocks.get.mockResolvedValue(request);
  mocks.allowed.mockRejectedValue(new Error("Database unavailable"));
  await expect(service.preview("org", "staff", "r1")).rejects.toThrow(
    /Database unavailable/,
  );
});
