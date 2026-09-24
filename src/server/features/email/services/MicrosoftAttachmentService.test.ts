import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EmailAccountRow,
  EmailMessageRow,
} from "../repositories/EmailRepository";

const state = vi.hoisted(() => ({
  requests: [] as string[],
  account: null as EmailAccountRow | null,
  message: null as EmailMessageRow | null,
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
vi.mock("../repositories/EmailRepository", () => ({
  EmailRepository: {
    getAccount: async () => state.account,
    getMessage: async () => state.message,
  },
}));
vi.mock("../providers/microsoft", () => ({
  graphRequest: async (_account: EmailAccountRow, url: string) => {
    state.requests.push(url);
    if (url.endsWith("/$value")) return new Response("pdf bytes");
    return new Response(
      JSON.stringify({
        value: [
          {
            id: "pdf-1",
            name: "Quote.pdf",
            contentType: "application/pdf",
            size: 42_000,
            isInline: false,
            "@odata.type": "#microsoft.graph.fileAttachment",
          },
          {
            id: "cloud-link",
            name: "Cloud file",
            contentType: null,
            size: 0,
            "@odata.type": "#microsoft.graph.referenceAttachment",
          },
        ],
      }),
    );
  },
}));

import {
  listMicrosoftAttachments,
  openMicrosoftAttachment,
} from "./MicrosoftAttachmentService";

beforeEach(() => {
  state.requests.length = 0;
  state.account = {
    id: "account-1",
    organizationId: "southside",
    provider: "microsoft",
    status: "connected",
    address: "info@southsidefencing.com.au",
    displayName: null,
    podId: null,
    inboxId: null,
    webhookId: null,
    syncCursor: null,
    credentials: null,
    lastError: null,
    autopilot: false,
    createdAt: "2026-09-25T00:00:00Z",
    updatedAt: "2026-09-25T00:00:00Z",
  } satisfies EmailAccountRow;
  state.message = {
    id: "message-1",
    organizationId: "southside",
    accountId: "account-1",
    externalMessageId: "graph-message-1",
    threadId: "thread-1",
    direction: "inbound",
    fromAddress: "customer@example.com",
    toAddresses: "[]",
    ccAddresses: "[]",
    bccAddresses: "[]",
    subject: "Quote",
    textBody: "See attached",
    htmlBody: null,
    status: "received",
    attachmentsJson: "[]",
    attachmentNotes: null,
    authoredBy: null,
    occurredAt: "2026-09-25T00:00:00Z",
    createdAt: "2026-09-25T00:00:00Z",
  } satisfies EmailMessageRow;
});

describe("Microsoft email attachments", () => {
  it("lists files and streams the selected PDF from Graph", async () => {
    const files = await listMicrosoftAttachments(
      "southside",
      "owner",
      "message-1",
    );
    expect(files).toEqual([
      {
        id: "pdf-1",
        name: "Quote.pdf",
        contentType: "application/pdf",
        size: 42_000,
        isInline: false,
      },
    ]);
    const { response } = await openMicrosoftAttachment(
      "southside",
      "owner",
      "message-1",
      "pdf-1",
    );
    expect(await response.text()).toBe("pdf bytes");
    expect(state.requests.at(-1)).toContain(
      "/me/messages/graph-message-1/attachments/pdf-1/$value",
    );
  });

  it("refuses cross-organization and unrelated message access before Graph", async () => {
    await expect(
      listMicrosoftAttachments("other", "owner", "message-1"),
    ).rejects.toThrow("Forbidden");
    state.message = { ...state.message!, accountId: "another-account" };
    await expect(
      openMicrosoftAttachment("southside", "owner", "message-1", "pdf-1"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(state.requests).toHaveLength(0);
  });
});
