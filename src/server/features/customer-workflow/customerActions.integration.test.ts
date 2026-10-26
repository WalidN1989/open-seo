import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/libsql";
import {
  createCaseTestDatabase,
  createVoiceCaseTestClient,
} from "@/test/tenancy/voiceCaseDatabase";
const org = "test-southside-workspace";
const state = vi.hoisted(() => ({
  db: null as unknown,
  send: vi.fn(),
  quote: vi.fn(),
  chat: vi.fn(),
}));
vi.mock("@/db", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@/db/schema", async () => import("@/db/business.schema"));
vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({ BusinessModuleService: { requireAccess: async () => undefined } }),
);
vi.mock(
  "@/server/features/business-modules/repositories/BusinessModuleRepository",
  () => ({
    BusinessModuleRepository: { findOwner: async () => ({ userId: "owner" }) },
  }),
);
vi.mock("@/server/features/email/services/EmailService", () => ({
  EmailService: { compose: state.send, sendReply: state.send },
}));
vi.mock(
  "@/server/features/communications/services/WhatsappAgentService",
  () => ({
    WhatsappAgentService: {
      getChat: state.chat,
      sendReply: state.send,
      sendTemplate: state.send,
    },
  }),
);
vi.mock("@/server/features/sms/services/SmsService", () => ({
  SmsService: {
    agentSend: state.send,
    thread: async () => ({ conversation: { phone: "+61400000000" } }),
  },
}));
vi.mock("@/server/features/quotes/services/QuoteService", () => ({
  QuoteService: { detail: state.quote },
}));
vi.mock("@/server/features/quotes/services/QuoteEmailService", () => ({
  QuoteEmailService: { emailQuote: state.send },
}));
vi.mock("@/server/features/crm/services/CrmService", () => ({
  CrmService: { updateLead: state.send },
}));
vi.mock("@/server/features/crm/repositories/LeadDetailRepository", () => ({
  LeadDetailRepository: {
    getLead: async () => ({
      lead: { id: "lead-test" },
      contact: { firstName: "TEST" },
    }),
  },
}));
vi.mock("./services/CallbackService", () => ({
  CallbackService: { start: state.send },
}));
vi.mock(
  "@/server/features/business-modules/repositories/BusinessAuditRepository",
  () => ({ BusinessAuditRepository: { record: async () => undefined } }),
);
import { CustomerActionService as service } from "./services/CustomerActionService";
import { ActionRepository } from "./repositories/ActionRepository";
const { client, close } = createVoiceCaseTestClient();
beforeAll(async () => {
  state.db = drizzle(client);
  await createCaseTestDatabase(client);
  await client.execute({
    sql: "INSERT INTO organization(id) VALUES (?)",
    args: [org],
  });
  await client.execute("CREATE TABLE quotes(id text primary key)");
  await client.execute("CREATE TABLE email_threads(id text primary key)");
  await client.execute("INSERT INTO quotes(id) VALUES ('quote-test')");
  await client.execute({
    sql: "INSERT INTO whatsapp_conversations(id,organization_id) VALUES ('chat-test',?)",
    args: [org],
  });
  for (const file of [
    "0115_southside_customer_actions.sql",
    "0116_southside_followup_links.sql",
  ]) {
    for (const statement of readFileSync(`drizzle/${file}`, "utf8").split(
      "--> statement-breakpoint",
    ))
      if (statement.trim()) await client.execute(statement);
  }
});
afterAll(close);
beforeEach(async () => {
  vi.stubEnv("SOUTHSIDE_WORKFLOW_ORGANIZATION_ID", "test-southside-workspace");
  await client.execute("DELETE FROM customer_action_requests");
  state.send
    .mockReset()
    .mockResolvedValue({ messageId: "TEST-provider-message" });
  state.quote.mockReset().mockResolvedValue({
    quote: {
      id: "quote-test",
      clientEmail: "test@example.invalid",
      totalMinor: 1990,
      leadId: null,
    },
    lines: [{ description: "TEST steel post", unitPriceMinor: 1990 }],
  });
  state.chat.mockReset().mockResolvedValue({
    chat: { phone: "+61400000000" },
    templates: [{ id: "template-test", body: "Hello {{1}}" }],
  });
});
const email = {
  kind: "email" as const,
  to: "test@example.invalid",
  subject: "TEST ONLY confirmation",
  text: "TEST enquiry. Is this what we agreed? Would you like a quotation?",
};
describe("durable single-message approval gate", () => {
  it("stores a draft and blocks every send without human approval", async () => {
    const request = await service.request(org, "watcher", email);
    expect(request.status).toBe("needs_approval");
    expect(
      (await service.execute(org, "watcher", request.approvalRequestId)).status,
    ).toBe("needs_approval");
    expect(state.send).not.toHaveBeenCalled();
  });
  it("cannot turn a watcher argument into human approval", async () => {
    await expect(
      service.request(org, "watcher", {
        ...email,
        approved: true,
      } as typeof email),
    ).rejects.toThrow();
    const request = await service.request(org, "watcher", email);
    await expect(
      service.approve(org, "watcher", request.approvalRequestId, true),
    ).rejects.toThrow("owner");
    expect(state.send).not.toHaveBeenCalled();
  });
  it("an owner approval covers only one action and survives parallel replay", async () => {
    const a = await service.request(org, "watcher", email);
    const b = await service.request(org, "watcher", {
      ...email,
      subject: "TEST second message",
    });
    await service.approve(org, "owner", a.approvalRequestId, true);
    await Promise.allSettled([
      service.execute(org, "watcher", a.approvalRequestId),
      service.execute(org, "watcher", a.approvalRequestId),
    ]);
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(
      (await service.execute(org, "watcher", b.approvalRequestId)).status,
    ).toBe("needs_approval");
    expect((await ActionRepository.get(org, a.approvalRequestId))?.status).toBe(
      "completed",
    );
  });
  it("cannot read, approve or execute another workspace's requests", async () => {
    const a = await service.request(org, "watcher", email);
    expect(await ActionRepository.get("b", a.approvalRequestId)).toBeNull();
    await expect(
      service.execute("b", "watcher", a.approvalRequestId),
    ).rejects.toThrow();
    await expect(
      service.approve("b", "owner", a.approvalRequestId, true),
    ).rejects.toThrow();
  });
  it("expires approval requests without contacting the provider", async () => {
    const a = await service.request(org, "watcher", email);
    await client.execute({
      sql: "UPDATE customer_action_requests SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?",
      args: [a.approvalRequestId],
    });
    await expect(
      service.approve(org, "owner", a.approvalRequestId, true),
    ).rejects.toThrow("expired");
    expect(state.send).not.toHaveBeenCalled();
  });
  it("does not replay an uncertain provider outcome", async () => {
    const a = await service.request(org, "watcher", email);
    await service.approve(org, "owner", a.approvalRequestId, true);
    state.send.mockRejectedValueOnce(
      new Error("Network response lost after acceptance"),
    );
    expect(
      (await service.execute(org, "watcher", a.approvalRequestId)).status,
    ).toBe("unknown");
    expect(
      (await service.execute(org, "watcher", a.approvalRequestId)).status,
    ).toBe("unknown");
    expect(state.send).toHaveBeenCalledTimes(1);
  });
  it("invalidates approval when the WhatsApp recipient or template changes", async () => {
    const a = await service.request(org, "watcher", {
      kind: "whatsapp_template",
      conversationId: "chat-test",
      templateId: "template-test",
      variables: { "1": "TEST" },
    });
    await service.approve(org, "owner", a.approvalRequestId, true);
    state.chat.mockResolvedValue({
      chat: { phone: "+61411111111" },
      templates: [{ id: "template-test", body: "Changed content" }],
    });
    await expect(
      service.execute(org, "watcher", a.approvalRequestId),
    ).rejects.toThrow("changed");
    expect(state.send).not.toHaveBeenCalled();
  });
  it("send_quote stays a draft until approval and quote edits require another approval", async () => {
    const a = await service.request(org, "watcher", {
      kind: "quote",
      quoteId: "quote-test",
    });
    expect(
      (await service.execute(org, "watcher", a.approvalRequestId)).status,
    ).toBe("needs_approval");
    await service.approve(org, "owner", a.approvalRequestId, true);
    state.quote.mockResolvedValue({
      quote: { id: "quote-test", totalMinor: 99900 },
      lines: [],
    });
    await expect(
      service.execute(org, "watcher", a.approvalRequestId),
    ).rejects.toThrow("changed");
    expect(state.send).not.toHaveBeenCalled();
  });
});
