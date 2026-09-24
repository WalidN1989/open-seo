import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailAccountRow } from "../repositories/EmailRepository";

const state = vi.hoisted(() => ({
  account: null as EmailAccountRow | null,
  urls: [] as string[],
  inserted: [] as Array<{
    externalMessageId: string | null;
    direction: string;
  }>,
  messages: new Set<string>(),
  thread: null as {
    id: string;
    subject: string | null;
    preview: string | null;
    lastMessageAt: string;
    lastDirection: string;
    messageCount: number;
  } | null,
}));

vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({
    BusinessModuleService: {
      requireAccess: async (organizationId: string) => {
        if (organizationId !== "southside") throw new Error("Forbidden");
      },
    },
  }),
);
vi.mock("../providers/microsoft", () => ({
  graphRequest: async (_account: EmailAccountRow, url: string) => {
    state.urls.push(url);
    const isHistory = url.includes("/mailFolders/");
    const isSent = url.includes("sentitems");
    const message = isHistory
      ? [
          {
            id: isSent ? "sent-1" : "inbox-1",
            conversationId: isSent ? "sent-thread" : "inbox-thread",
            subject: "Old message",
            body: { contentType: "text", content: "Existing mail" },
            from: {
              emailAddress: {
                address: isSent
                  ? "info@southsidefencing.com.au"
                  : "customer@example.com",
              },
            },
            toRecipients: [
              {
                emailAddress: {
                  address: isSent
                    ? "customer@example.com"
                    : "info@southsidefencing.com.au",
                },
              },
            ],
            receivedDateTime: "2026-08-01T00:00:00Z",
            sentDateTime: "2026-08-01T00:00:00Z",
          },
        ]
      : [];
    return new Response(
      JSON.stringify({
        value: message,
        "@odata.deltaLink": isHistory
          ? `https://graph.microsoft.com/v1.0/history/${isSent ? "sentitems" : "inbox"}/done`
          : "https://graph.microsoft.com/v1.0/new/done",
      }),
    );
  },
}));
vi.mock("../repositories/EmailRepository", () => ({
  EmailRepository: {
    getAccount: async () => state.account,
    getAccountById: async () => state.account,
    updateAccount: async (_id: string, patch: Partial<EmailAccountRow>) => {
      state.account = { ...state.account!, ...patch };
      return state.account;
    },
    findMessageByExternalId: async (_id: string, externalId: string) =>
      state.messages.has(externalId) ? { id: externalId } : null,
    findThreadByExternalId: async () => state.thread,
    upsertThread: async (
      _account: EmailAccountRow,
      values: {
        subject: string | null;
        preview: string | null;
        lastMessageAt: string;
        lastDirection: string;
      },
    ) => {
      state.thread = { id: "thread-1", messageCount: 1, ...values };
      return state.thread;
    },
    insertMessage: async (values: {
      externalMessageId: string | null;
      direction: string;
    }) => {
      state.inserted.push(values);
      if (values.externalMessageId)
        state.messages.add(values.externalMessageId);
    },
  },
}));

import { importExistingMicrosoftMail } from "./MicrosoftMailSyncService";

beforeEach(() => {
  state.urls.length = 0;
  state.inserted.length = 0;
  state.messages.clear();
  state.thread = null;
  state.account = {
    id: "account-1",
    organizationId: "southside",
    provider: "microsoft",
    status: "connected",
    address: "info@southsidefencing.com.au",
    syncCursor: JSON.stringify({
      url: "https://graph.microsoft.com/v1.0/new/start",
      cutoff: "2026-09-25T00:00:00.000Z",
    }),
  } as EmailAccountRow;
});

describe("Microsoft historical mail import", () => {
  it("imports old Inbox and Sent Items once without moving the new-mail cutoff", async () => {
    const first = await importExistingMicrosoftMail("southside", "owner");
    expect(first).toEqual({ historyComplete: true });
    expect(
      state.inserted.map((item) => [item.externalMessageId, item.direction]),
    ).toEqual([
      ["inbox-1", "inbound"],
      ["sent-1", "outbound"],
    ]);
    const cursor = JSON.parse(state.account!.syncCursor!) as Record<
      string,
      unknown
    >;
    expect(cursor.cutoff).toBe("2026-09-25T00:00:00.000Z");
    expect(cursor.historyDone).toBe(true);
    await importExistingMicrosoftMail("southside", "owner");
    expect(state.inserted).toHaveLength(2);
  });

  it("does not start an import for another organization", async () => {
    await expect(importExistingMicrosoftMail("other", "owner")).rejects.toThrow(
      "Forbidden",
    );
    expect(state.urls).toHaveLength(0);
  });
});
