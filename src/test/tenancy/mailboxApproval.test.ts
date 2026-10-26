import { z } from "zod";
import type * as RepoModule from "@/server/features/email/repositories/EmailRepository";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ORG_A,
  ORG_B,
  USER_OWNER_A,
  USER_OWNER_B,
  createTenancyFixture,
  type TestDb,
} from "./fixture";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: (name: string) =>
    Promise.resolve(
      name === "INTERNAL_CRON_SECRET" ? "test-internal-secret" : undefined,
    ),
  getRequiredEnvValue: () => Promise.resolve("mailbox-test-encryption-secret"),
  isHostedServerAuthMode: () => Promise.resolve(false),
}));
let db: TestDb;
const requests: { url: string; body: Record<string, unknown> }[] = [];
let repo: typeof RepoModule.EmailRepository;
let accountId: string;
let threadId: string;
const signature = "Test Manager, Example shop";

beforeAll(async () => {
  const fixture = await createTenancyFixture();
  db = fixture.db;
  vi.doMock("@/db", () => ({ db, withPgClient: (fn: () => unknown) => fn() }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  const schema = await import("@/db/schema");
  for (const organizationId of [ORG_A, ORG_B]) {
    await db
      .insert(schema.organizationModuleEntitlements)
      .values({
        id: `email-${organizationId}`,
        organizationId,
        moduleKey: "email",
        status: "enabled",
      })
      .onConflictDoNothing();
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      requests.push({
        url: String(url),
        body: z
          .record(z.string(), z.unknown())
          .parse(
            JSON.parse(typeof options?.body === "string" ? options.body : "{}"),
          ),
      });
      return Response.json(
        String(url).endsWith("/send")
          ? { messageId: "<approved@example.test>" }
          : { ok: true, smtpProblem: null },
      );
    }),
  );
  // Import after the real tenant database is installed.
  const { EmailAccountService } =
    await import("@/server/features/email/services/EmailAccountService");
  ({ EmailRepository: repo } =
    await import("@/server/features/email/repositories/EmailRepository"));
  for (const [organizationId, userId, address] of [
    [ORG_A, USER_OWNER_A, "care@example.test"],
    [ORG_B, USER_OWNER_B, "other@example.test"],
  ]) {
    const account = await EmailAccountService.connectMailbox(
      organizationId,
      userId,
      {
        displayName: "Test shop",
        address,
        password: "synthetic-mailbox-password",
        imapHost: "imap.example.test",
        imapPort: 993,
        smtpHost: "smtp.example.test",
        smtpPort: 465,
      },
    );
    if (organizationId === ORG_A) accountId = account!.id;
  }
});
afterAll(() => vi.unstubAllGlobals());

describe("mailbox approval preferences", () => {
  it("stores preferences only for the authorized mailbox and preserves its login", async () => {
    const { EmailAccountService } =
      await import("@/server/features/email/services/EmailAccountService");
    const { decryptCredentials } =
      await import("@/server/lib/connection-secrets");
    const other = await repo.getAccount(ORG_B);
    const account = await EmailAccountService.setMailboxPreferences(
      ORG_A,
      USER_OWNER_A,
      { signature, manualOnly: true, pollEveryFiveMinutes: true },
    );
    expect(account?.mailboxPreferences).toEqual({
      signature,
      manualOnly: true,
      pollEveryFiveMinutes: true,
    });
    expect(account?.autopilot).toBe(false);
    expect(await repo.getAccount(ORG_B)).toEqual(other);
    expect(
      (await decryptCredentials((await repo.getAccount(ORG_A)).credentials))
        .PASSWORD,
    ).toBe("synthetic-mailbox-password");
    await expect(
      EmailAccountService.setMailboxPreferences(ORG_A, USER_OWNER_B, {
        signature: "",
        manualOnly: false,
        pollEveryFiveMinutes: false,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      EmailAccountService.setAutopilot(ORG_A, USER_OWNER_A, true),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("blocks automatic send paths and unconfirmed MCP sends, without a provider call", async () => {
    const { outboundFor } =
      await import("@/server/features/email/providers/outbound");
    const { requireMcpSendConfirmation } =
      await import("@/server/features/email/mailboxPreferences");
    const account = await repo.getAccount(ORG_A);
    const before = requests.length;
    await expect(outboundFor(account)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(
      requireMcpSendConfirmation(account, undefined),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      requireMcpSendConfirmation(account, false),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      requireMcpSendConfirmation(account, true),
    ).resolves.toBeUndefined();
    await expect(
      requireMcpSendConfirmation(await repo.getAccount(ORG_B), undefined),
    ).resolves.toBeUndefined();
    expect(requests).toHaveLength(before);
  });

  it("passes the five-minute check only to the selected mailbox", async () => {
    const { MailboxIngestService } =
      await import("@/server/features/email/services/MailboxIngestService");
    const accounts = await MailboxIngestService.accountsForBridge();
    expect(
      accounts.find((account) => account.accountId === accountId)
        ?.pollIntervalMs,
    ).toBe(300_000);
    expect(
      accounts.find((account) => account.address === "other@example.test")
        ?.pollIntervalMs,
    ).toBeUndefined();
  });

  it("saves a signed draft with CC/BCC and sends nothing until human approval", async () => {
    const { MailboxIngestService } =
      await import("@/server/features/email/services/MailboxIngestService");
    await MailboxIngestService.ingest({
      accountId,
      folder: "inbox",
      backfill: true,
      messages: [
        {
          uid: 1,
          messageId: "<customer@example.test>",
          inReplyTo: null,
          references: [],
          from: "customer@example.test",
          to: ["care@example.test"],
          cc: [],
          subject: "An order",
          text: "Please help",
          html: null,
          date: new Date().toISOString(),
          attachments: [],
        },
      ],
    });
    const { EmailService } =
      await import("@/server/features/email/services/EmailService");
    const { EmailDraftService } =
      await import("@/server/features/email/services/EmailDraftService");
    threadId = (await EmailService.workspace(ORG_A, USER_OWNER_A)).threads[0]
      .id;
    const before = requests.filter((request) =>
      request.url.endsWith("/send"),
    ).length;
    const draft = await EmailDraftService.saveReplyDraft(
      ORG_A,
      USER_OWNER_A,
      {
        threadId,
        text: "Draft reply",
        cc: ["copy@example.test"],
        bcc: ["blind@example.test"],
      },
      USER_OWNER_A,
    );
    const detail = await EmailService.thread(ORG_A, USER_OWNER_A, threadId);
    expect(detail.messages.at(-1)).toMatchObject({
      direction: "draft",
      textBody: `Draft reply\n\n${signature}`,
      ccAddresses: ["copy@example.test"],
      bccAddresses: ["blind@example.test"],
    });
    expect(
      requests.filter((request) => request.url.endsWith("/send")),
    ).toHaveLength(before);
    await EmailService.approveDraft(ORG_A, USER_OWNER_A, {
      messageId: draft.draftMessageId,
    });
    const sent = requests.filter((request) => request.url.endsWith("/send"));
    expect(sent).toHaveLength(before + 1);
    expect(sent.at(-1)?.body).toMatchObject({
      from: { address: "care@example.test" },
      text: `Draft reply\n\n${signature}`,
      cc: ["copy@example.test"],
      bcc: ["blind@example.test"],
      inReplyTo: "customer@example.test",
    });
    expect(
      (await EmailService.thread(ORG_A, USER_OWNER_A, threadId)).messages.at(-1)
        ?.direction,
    ).toBe("outbound");
  });
  it("keeps self-addressed website notifications without replying or duplicating Sent", async () => {
    const { MailboxIngestService } =
      await import("@/server/features/email/services/MailboxIngestService");
    const message = {
      uid: 2,
      messageId: "<website-order@example.test>",
      inReplyTo: null,
      references: [],
      from: "Test shop <care@example.test>",
      to: ["care@example.test"],
      cc: [],
      subject: "Website order 123",
      text: "An order was placed.",
      html: null,
      date: new Date().toISOString(),
      attachments: [],
    };
    const before = requests.length;
    expect(
      await MailboxIngestService.ingest({
        accountId,
        folder: "inbox",
        backfill: false,
        messages: [message],
      }),
    ).toMatchObject({ accepted: 1 });
    expect(
      await MailboxIngestService.ingest({
        accountId,
        folder: "sent",
        backfill: true,
        messages: [message],
      }),
    ).toMatchObject({ accepted: 0 });
    expect(
      await MailboxIngestService.ingest({
        accountId,
        folder: "inbox",
        backfill: true,
        messages: [message],
      }),
    ).toMatchObject({ accepted: 0 });
    const { EmailService } =
      await import("@/server/features/email/services/EmailService");
    const workspace = await EmailService.workspace(ORG_A, USER_OWNER_A);
    const notification = workspace.threads.find(
      (thread) => thread.subject === message.subject,
    );
    expect(notification).toMatchObject({
      lastDirection: "inbound",
      messageCount: 1,
    });
    const detail = await EmailService.thread(
      ORG_A,
      USER_OWNER_A,
      notification?.id ?? "",
    );
    expect(detail.messages).toHaveLength(1);
    expect(detail.messages[0]).toMatchObject({
      direction: "inbound",
      status: "received",
    });
    expect(requests).toHaveLength(before);
    const other = await repo.getAccount(ORG_B);
    expect(
      await MailboxIngestService.ingest({
        accountId: other.id,
        folder: "inbox",
        backfill: false,
        messages: [
          {
            ...message,
            from: "other@example.test",
            to: ["other@example.test"],
          },
        ],
      }),
    ).toMatchObject({ accepted: 0 });
  });
});
