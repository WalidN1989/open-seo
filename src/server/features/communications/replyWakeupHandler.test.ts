import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  authorized: vi.fn(),
  pending: vi.fn(),
  handoffs: vi.fn(),
  handoffRun: vi.fn(),
  run: vi.fn(),
}));
vi.mock("@/server/lib/internal-secret", () => ({
  authorizedByInternalSecret: mocks.authorized,
}));
vi.mock("./repositories/WhatsappReplyJobRepository", () => ({
  WhatsappReplyJobRepository: { pendingWakeups: mocks.pending },
}));
vi.mock("./services/WhatsappReplyJobService", () => ({
  runDueWhatsappReplies: mocks.run,
}));
vi.mock("./repositories/WhatsappHandoffOutboxRepository", () => ({
  WhatsappHandoffOutboxRepository: { pendingWakeups: mocks.handoffs },
}));
vi.mock("./services/WhatsappHandoffService", () => ({
  WhatsappHandoffService: { runDue: mocks.handoffRun },
}));
import { handleWhatsappReplyWakeup } from "./replyWakeupHandler";
function request(body: unknown) {
  return new Request("http://localhost/api/internal/whatsapp-replies", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorized.mockResolvedValue(true);
  mocks.pending.mockResolvedValue([]);
  mocks.handoffs.mockResolvedValue([]);
});
describe("event-driven reply endpoint", () => {
  it("rejects unauthorized recovery without reading the queue", async () => {
    mocks.authorized.mockResolvedValue(false);
    expect(
      (await handleWhatsappReplyWakeup(request({ action: "recover" }))).status,
    ).toBe(401);
    expect(mocks.pending).not.toHaveBeenCalled();
  });
  it("validates actions before running any reply", async () => {
    expect(
      (
        await handleWhatsappReplyWakeup(
          request({ action: "run", conversationId: "" }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("recovers durable deadlines without running replies", async () => {
    const response = await handleWhatsappReplyWakeup(
      request({ action: "recover" }),
    );
    expect(response.status).toBe(200);
    expect(mocks.pending).toHaveBeenCalledWith(undefined);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("processes only the notified conversation", async () => {
    await handleWhatsappReplyWakeup(
      request({ action: "run", conversationId: "chat" }),
    );
    expect(mocks.run).toHaveBeenCalledWith("chat");
    expect(mocks.pending).toHaveBeenCalledWith("chat");
  });
});

it("marks only handoff work as owning a persisted retry budget", async () => {
  mocks.handoffs.mockResolvedValue([
    { conversationId: "handoff", dueAt: "2026-11-06T10:00:00.000Z" },
  ]);
  mocks.pending.mockResolvedValue([
    { conversationId: "reply", dueAt: "2026-11-06T10:00:00.000Z" },
  ]);
  const response = await handleWhatsappReplyWakeup(
    request({ action: "recover" }),
  );
  expect(await response.json()).toEqual([
    { conversationId: "reply", dueAt: "2026-11-06T10:00:00.000Z" },
    {
      conversationId: "handoff",
      dueAt: "2026-11-06T10:00:00.000Z",
      source: "handoff",
    },
  ]);
});
