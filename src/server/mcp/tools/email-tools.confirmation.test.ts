import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeToolContext } from "./tool-test-support";
const mocks = vi.hoisted(() => ({
  memberships: vi.fn(),
  account: vi.fn(),
  send: vi.fn(),
  reply: vi.fn(),
  decrypt: vi.fn(),
}));
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: { listOrganizationIdsForUser: mocks.memberships },
}));
vi.mock("@/server/features/email/repositories/EmailRepository", () => ({
  EmailRepository: { getAccount: mocks.account },
}));
vi.mock("@/server/features/email/services/EmailService", () => ({
  EmailService: { compose: mocks.send, sendReply: mocks.reply },
}));
vi.mock("@/server/features/email/services/EmailDraftService", () => ({
  EmailDraftService: {},
}));
vi.mock("@/server/lib/connection-secrets", () => ({
  decryptCredentials: mocks.decrypt,
}));
import { emailSurface } from "./email-tools";

async function call(name: string, args: Record<string, unknown>) {
  const tool = emailSurface.tools.find((entry) => entry.name === name);
  if (!tool) throw new Error("Missing email tool");
  await Reflect.apply(tool.handler, undefined, [args, makeToolContext()]);
}

describe("MCP mail confirmation boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.memberships.mockResolvedValue([
      "manual-workspace",
      "existing-workspace",
    ]);
    mocks.account.mockImplementation((organizationId: string) =>
      Promise.resolve({ provider: "mailbox", credentials: organizationId }),
    );
    mocks.decrypt.mockImplementation((value: string) =>
      Promise.resolve(
        value === "manual-workspace"
          ? { MAILBOX_PREFERENCES: JSON.stringify({ manualOnly: true }) }
          : {},
      ),
    );
    mocks.send.mockResolvedValue({
      messageId: "synthetic-message",
      threadId: "synthetic-thread",
    });
    mocks.reply.mockResolvedValue({ messageId: "synthetic-message" });
  });
  for (const name of ["send_email", "reply_to_email_thread"]) {
    it(`${name} refuses a missing or false confirmation before sending`, async () => {
      for (const confirmed of [undefined, false]) {
        await expect(
          call(name, {
            organizationId: "manual-workspace",
            threadId: "thread",
            to: "person@example.test",
            subject: "Example",
            text: "Draft text",
            confirmed,
          }),
        ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      }
      expect(mocks.send).not.toHaveBeenCalled();
      expect(mocks.reply).not.toHaveBeenCalled();
    });
    it(`${name} accepts explicit confirmation and preserves copies`, async () => {
      await call(name, {
        organizationId: "manual-workspace",
        threadId: "thread",
        to: "person@example.test",
        subject: "Example",
        text: "Approved text",
        confirmed: true,
        cc: ["copy@example.test"],
        bcc: ["blind@example.test"],
      });
      const send = name === "send_email" ? mocks.send : mocks.reply;
      expect(send).toHaveBeenCalledWith(
        "manual-workspace",
        "user_123",
        expect.objectContaining({
          text: "Approved text",
          cc: ["copy@example.test"],
          bcc: ["blind@example.test"],
        }),
      );
    });
  }
  it("keeps existing workspaces' send contract and refuses foreign workspaces", async () => {
    await call("send_email", {
      organizationId: "existing-workspace",
      to: "person@example.test",
      subject: "Example",
      text: "Approved by existing caller",
    });
    expect(mocks.send).toHaveBeenCalledOnce();
    await expect(
      call("send_email", {
        organizationId: "foreign-workspace",
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.send).toHaveBeenCalledOnce();
  });
});
