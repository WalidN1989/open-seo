import { rmSync } from "node:fs";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { createCaseTestDatabase } from "@/test/tenancy/voiceCaseDatabase";
const state = vi.hoisted(() => ({
  db: null as unknown,
  access: vi.fn(),
  modules: vi.fn(),
}));
vi.mock("@/db", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@/db/schema", async () => import("@/db/business.schema"));
vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({
    BusinessModuleService: {
      requireAccess: state.access,
      getAccess: state.modules,
    },
  }),
);
vi.mock("@/db/runBatch", () => ({
  runBatch: async (
    build: (
      tx: Pick<ReturnType<typeof drizzle>, "insert" | "update">,
    ) => readonly Promise<unknown>[],
  ) => {
    await drizzle(client).transaction(async (tx) => {
      for (const statement of build(tx)) await statement;
    });
  },
}));
import { CaseService } from "./services/CaseService";
import { CaseRepository } from "./repositories/CaseRepository";
import { AttentionService } from "./services/AttentionService";
import { decodeAttentionCursor } from "./attentionCursor";
const databasePath = `/private/tmp/du-case-test-${crypto.randomUUID()}.sqlite`;
const client = createClient({ url: `file:${databasePath}` });
const id = "b34abf63-d6ea-4fa2-9b3b-0ef8c85a9ea1";
beforeAll(async () => {
  state.db = drizzle(client);
  await createCaseTestDatabase(client);
});
afterAll(() => {
  client.close();
  rmSync(databasePath, { force: true });
});
beforeEach(async () => {
  state.access.mockReset().mockResolvedValue(undefined);
  state.modules.mockResolvedValue(
    ["voice", "whatsapp", "sms"].map((key) => ({
      key,
      enabled: true,
      permission: "manage",
    })),
  );
  for (const name of [
    "voice_case_calls",
    "voice_cases",
    "voice_phone_calls",
    "whatsapp_messages",
    "whatsapp_conversations",
    "sms_messages",
    "sms_conversations",
    "crm_contacts",
    "crm_leads",
    "commerce_orders",
    "business_audit_events",
    "attention_sources",
    "attention_heads",
  ])
    await client.execute(`DELETE FROM ${name}`);
});
async function create(extra = {}) {
  return CaseService.create("a", "owner", {
    id,
    customerName: "Test customer",
    reason: "Check delivery",
    ...extra,
  });
}
async function check(cursor?: string, limit = 20) {
  return AttentionService.get("a", "owner", { cursor, limit });
}

describe("cases, database readiness helpers and attention cursors", () => {
  it("stores data, retries creates, and refuses foreign IDs or missing permissions", async () => {
    const row = await create();
    expect(row.status).toBe("open");
    expect((await create()).id).toBe(row.id);
    expect(
      (await CaseService.list("a", "owner", { limit: 20 })).cases,
    ).toHaveLength(1);
    await expect(
      CaseService.update("b", "owner", { caseId: id, status: "closed" }),
    ).rejects.toThrow("Case not found");
    await client.execute(
      "INSERT INTO crm_contacts (id,organization_id) VALUES ('foreign','b')",
    );
    await expect(
      create({ id: crypto.randomUUID(), contactId: "foreign" }),
    ).rejects.toThrow("linked record");
    state.access.mockRejectedValueOnce(new Error("FORBIDDEN"));
    await expect(
      CaseService.create("a", "viewer", { customerName: "No", reason: "No" }),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("links only exact conversation IDs before or after the webhook, rejecting conflict", async () => {
    await create();
    await CaseService.update("a", "owner", {
      caseId: id,
      externalConversationId: "conv-1",
    });
    await client.execute(
      "INSERT INTO voice_phone_calls (id,organization_id,external_conversation_id) VALUES ('call','a','conv-1'),('other','b','conv-1')",
    );
    expect(await CaseRepository.callLinks("a", [id])).toEqual([
      { caseId: id, externalConversationId: "conv-1", callId: "call" },
    ]);
    const second = await create({ id: crypto.randomUUID() });
    await expect(
      CaseService.update("a", "owner", {
        caseId: second.id,
        externalConversationId: "conv-1",
      }),
    ).rejects.toThrow("already linked");
    expect(await CaseRepository.linkCall("b", id, "conv-2")).toBe(false);
  });
  it("returns tiny unchanged checks, closed deltas and workspace-bound cursors", async () => {
    await create();
    const first = await check();
    expect(first.items).toMatchObject([
      { kind: "case", id, state: "attention" },
    ]);
    expect(await check(first.cursor)).toEqual({
      items: [],
      cursor: first.cursor,
    });
    await CaseService.update("a", "owner", { caseId: id, status: "closed" });
    const next = await check(first.cursor);
    expect(next.items).toEqual([{ kind: "case", id, state: "cleared" }]);
    expect(() =>
      decodeAttentionCursor(next.cursor, "b", "sms,voice,whatsapp"),
    ).toThrow("Invalid cursor");
    expect((await check()).items).toEqual([]);
    await client.execute(
      "INSERT INTO whatsapp_conversations(id,organization_id,status) VALUES ('cross-chat','a','pending')",
    );
    await client.execute(
      "INSERT INTO whatsapp_messages(id,organization_id,conversation_id,direction) VALUES ('foreign-row','b','cross-chat','inbound')",
    );
    expect(
      (
        await client.execute(
          "SELECT count(*) n FROM attention_sources WHERE entity_id='cross-chat'",
        )
      ).rows[0]?.n,
    ).toBe(2);
  });
  it("pages tied changes and catches updates made while paging", async () => {
    await create();
    const second = await create({ id: crypto.randomUUID() });
    const page = await check(undefined, 1);
    expect(page.hasMore).toBe(true);
    await CaseService.update("a", "owner", {
      caseId: second.id,
      status: "closed",
    });
    const page2 = await check(page.cursor, 1);
    const page3 = await check(page2.cursor);
    expect([...page2.items, ...page3.items]).toContainEqual({
      kind: "case",
      id: second.id,
      state: "cleared",
    });
  });
  it("marks readiness on actual mode changes and resolved, without closing", async () => {
    await client.execute(
      "INSERT INTO whatsapp_conversations (id,organization_id,reply_mode,status) VALUES ('chat','a','auto','pending')",
    );
    await create({ whatsappConversationId: "chat" });
    await client.execute(
      "UPDATE whatsapp_conversations SET reply_mode='manual' WHERE id='chat'",
    );
    expect(await CaseRepository.get("a", id)).toMatchObject({
      status: "open",
      readyToClose: true,
    });
    expect((await check()).items).toContainEqual(
      expect.objectContaining({ kind: "case", readyToClose: true }),
    );
    await CaseService.update("a", "owner", { caseId: id, status: "closed" });
    await client.execute(
      "UPDATE whatsapp_conversations SET reply_mode='auto',status='closed' WHERE id='chat'",
    );
    expect(await CaseRepository.get("a", id)).toMatchObject({
      status: "closed",
      readyToClose: false,
    });
  });
  it("marks explicit CRM/order links and accepted human replies; ignores failed sends", async () => {
    await client.execute(
      "INSERT INTO crm_contacts (id,organization_id,updated_at) VALUES ('contact','a','old')",
    );
    await create({ contactId: "contact" });
    await client.execute(
      "UPDATE crm_contacts SET updated_at='new' WHERE id='contact'",
    );
    expect(await CaseRepository.get("a", id)).toMatchObject({
      readyToClose: true,
      readyReason: "CRM contact updated",
    });
    await client.execute(
      "INSERT INTO whatsapp_conversations (id,organization_id) VALUES ('chat','a')",
    );
    const second = await create({
      id: crypto.randomUUID(),
      whatsappConversationId: "chat",
    });
    await client.execute(
      "INSERT INTO whatsapp_messages (id,organization_id,conversation_id,direction,status) VALUES ('msg','a','chat','outbound','failed')",
    );
    await client.execute(
      "INSERT INTO business_audit_events (id,organization_id,action,target_id) VALUES ('audit','a','whatsapp.message.sent','msg')",
    );
    expect((await CaseRepository.get("a", second.id))?.readyToClose).toBe(
      false,
    );
    await client.execute(
      "UPDATE whatsapp_messages SET status='sent' WHERE id='msg'",
    );
    await client.execute(
      "INSERT INTO business_audit_events (id,organization_id,action,target_id) VALUES ('audit2','a','whatsapp.message.sent','msg')",
    );
    expect((await CaseRepository.get("a", second.id))?.readyToClose).toBe(true);
  });
  it("reads summaries and explicit flags only, clips messages, and emits resolved clears", async () => {
    await client.execute({
      sql: "INSERT INTO voice_phone_calls (id,organization_id,direction,summary,captured_json,created_at) VALUES ('in','a','inbound','Needs help','{}','2026-10-25T00:00:00.000Z'),('out','a','outbound','Private outgoing','{}','2026-10-25T00:00:00.000Z')",
      args: [],
    });
    await client.execute(
      "INSERT INTO whatsapp_conversations (id,organization_id,status) VALUES ('chat','a','pending')",
    );
    await client.execute({
      sql: "INSERT INTO whatsapp_messages (id,organization_id,conversation_id,direction,body,created_at) VALUES ('msg','a','chat','inbound',?,'2026-10-25T00:00:00.000Z')",
      args: ["x".repeat(10000)],
    });
    const first = await check();
    expect(first.items.find((i) => i.kind === "call")).toMatchObject({
      id: "in",
      resolved: "unknown",
      callbackNeeded: "unknown",
    });
    expect(first.items.some((i) => i.id === "out")).toBe(false);
    expect(
      first.items.find((i) => i.kind === "whatsapp")?.lastMessage,
    ).toHaveLength(200);
    await client.execute(
      "UPDATE whatsapp_conversations SET status='resolved' WHERE id='chat'",
    );
    expect((await check(first.cursor)).items).toContainEqual({
      kind: "whatsapp",
      id: "chat",
      state: "cleared",
    });
    expect(JSON.stringify(first)).not.toContain("transcript");
  });
  it("stores the agreed policy without placing calls or writing during a check", async () => {
    const result = await CaseService.list("a", "owner", { limit: 20 });
    expect(result.policy).toMatchObject({
      calleeName: "Umi",
      timezone: "Asia/Colombo",
      windowStart: "08:00",
      windowEnd: "22:00",
      dailyCallLimit: 5,
      noAnswerRetries: 1,
      customerGapHours: 4,
    });
    const head = await client.execute("SELECT * FROM attention_heads");
    await check();
    await check();
    expect(
      (await client.execute("SELECT * FROM attention_heads")).rows,
    ).toEqual(head.rows);
  });
  it("uses the app's closed status and flags CRM changes through an explicitly linked chat", async () => {
    await client.execute(
      "INSERT INTO crm_contacts (id,organization_id,updated_at) VALUES ('crm','a','old')",
    );
    await client.execute(
      "INSERT INTO whatsapp_conversations (id,organization_id,status,reply_mode,contact_id) VALUES ('linked','a','pending','auto','crm')",
    );
    await create({ whatsappConversationId: "linked" });
    await client.execute(
      "UPDATE crm_contacts SET updated_at='new' WHERE id='crm'",
    );
    expect((await CaseRepository.get("a", id))?.readyToClose).toBe(true);
    const second = await create({
      id: crypto.randomUUID(),
      whatsappConversationId: "linked",
    });
    await client.execute(
      "UPDATE whatsapp_conversations SET status='closed' WHERE id='linked'",
    );
    expect((await CaseRepository.get("a", second.id))?.readyToClose).toBe(true);
  });
  it("handles a queued human reply when its accepted provider delivery arrives", async () => {
    await client.execute(
      "INSERT INTO whatsapp_conversations (id,organization_id) VALUES ('chat','a')",
    );
    await create({ whatsappConversationId: "chat" });
    await client.execute(
      "INSERT INTO whatsapp_messages (id,organization_id,conversation_id,direction,status) VALUES ('human','a','chat','outbound','queued'),('auto','a','chat','outbound','queued')",
    );
    await client.execute(
      "INSERT INTO business_audit_events (id,organization_id,action,target_id) VALUES ('audit','a','whatsapp.message.sent','human')",
    );
    await client.execute(
      "UPDATE whatsapp_messages SET status='delivered' WHERE id='auto'",
    );
    expect((await CaseRepository.get("a", id))?.readyToClose).toBe(false);
    await client.execute(
      "UPDATE whatsapp_messages SET status='delivered' WHERE id='human'",
    );
    expect((await CaseRepository.get("a", id))?.readyToClose).toBe(true);
  });
  it("honors since and module access, and stops listing SMS after a reply or closure", async () => {
    await client.execute(
      "INSERT INTO voice_phone_calls(id,organization_id,direction,created_at,captured_json) VALUES ('old','a','inbound','2020-01-01T00:00:00.000Z','{}')",
    );
    await client.execute(
      "INSERT INTO sms_conversations (id,organization_id,status,last_inbound_at) VALUES ('sms','a','open','2026-10-25T00:00:00.000Z')",
    );
    const first = await AttentionService.get("a", "owner", {
      since: "2026-10-24T00:00:00Z",
      limit: 20,
    });
    expect(first.items.some((i) => i.kind === "call")).toBe(false);
    expect(first.items).toContainEqual(
      expect.objectContaining({ kind: "sms", state: "attention" }),
    );
    await client.execute(
      "UPDATE sms_conversations SET status='closed' WHERE id='sms'",
    );
    expect((await check(first.cursor)).items).toContainEqual({
      kind: "sms",
      id: "sms",
      state: "cleared",
    });
    state.modules.mockResolvedValue([
      { key: "voice", enabled: true, permission: "view" },
    ]);
    expect((await check()).items.some((i) => i.kind === "sms")).toBe(false);
    await expect(check(first.cursor)).rejects.toThrow("Invalid cursor");
  });
  it("keeps one revision row for repeated changes, with no cursor writes or history growth", async () => {
    await create();
    for (let i = 0; i < 250; i++)
      await client.execute({
        sql: "UPDATE voice_cases SET last_outcome=? WHERE id=?",
        args: [String(i), id],
      });
    expect(
      (
        await client.execute(
          "SELECT count(*) n FROM attention_sources WHERE kind='case'",
        )
      ).rows[0]?.n,
    ).toBe(1);
  });
});
