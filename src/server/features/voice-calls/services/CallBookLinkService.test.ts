import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as schema from "@/db/business.schema";
const state = vi.hoisted(() => ({
  db: null as unknown,
  approval: vi.fn(),
  send: vi.fn(),
  modules: vi.fn(),
  connection: vi.fn(),
  access: vi.fn(),
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: async () => "https://du.example",
}));
vi.mock(
  "@/server/features/business-modules/repositories/BusinessAuditRepository",
  () => ({ BusinessAuditRepository: { record: vi.fn() } }),
);
vi.mock("@/db", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@/db/schema", async () => import("@/db/business.schema"));
vi.mock("@/server/features/communications/providers/twilioContent", () => ({
  fetchCallBookLinkTemplate: state.approval,
}));
vi.mock("@/server/features/communications/providers/whatsapp", () => ({
  sendWhatsappTemplate: state.send,
}));
vi.mock(
  "@/server/features/business-modules/repositories/BusinessModuleRepository",
  () => ({ BusinessModuleRepository: { listEntitlements: state.modules } }),
);
vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({ BusinessModuleService: { requireAccess: state.access } }),
);
vi.mock("../repositories/PhoneCallRepository", () => ({
  PhoneCallRepository: { getIntegrationById: state.connection },
}));
import { CallBookLinkService as service } from "./CallBookLinkService";

const client = createClient({ url: ":memory:" });
const url = "https://books.example/products/one";
const captured = {
  whatsapp_link_consent: "true",
  whatsapp_preference: "same number",
  requested_product_url: url,
  caller_name: "Walid",
};
const sid = "HX" + "1".repeat(32);
const send = () => service.send("org", "voice", "call");
async function fields(values: Record<string, string>) {
  await client.execute({
    sql: "UPDATE voice_phone_calls SET captured_json=? WHERE id='call'",
    args: [JSON.stringify({ ...captured, ...values })],
  });
}
beforeAll(async () => {
  state.db = drizzle(client);
  for (const table of [
    schema.voicePhoneCalls,
    schema.voiceBookLinkSettings,
    schema.whatsappConnections,
    schema.whatsappConversations,
    schema.whatsappMessages,
    schema.commerceProducts,
  ]) {
    const config = getTableConfig(table);
    await client.execute(
      `CREATE TABLE "${config.name}" (${config.columns.map((c) => `"${c.name}" ${c.getSQLType()}${c.primary ? " PRIMARY KEY" : ""}`).join(",")})`,
    );
  }
  await client.execute(
    "CREATE UNIQUE INDEX chat_identity ON whatsapp_conversations(connection_id,external_conversation_id)",
  );
});
afterAll(() => client.close());
beforeEach(async () => {
  vi.clearAllMocks();
  for (const table of [
    "voice_phone_calls",
    "voice_book_link_settings",
    "whatsapp_connections",
    "whatsapp_messages",
    "whatsapp_conversations",
    "commerce_products",
  ])
    await client.execute(`DELETE FROM ${table}`);
  await client.execute({
    sql: "INSERT INTO voice_book_link_settings (connection_id,organization_id,sender_id,content_sid,enabled,started_at) VALUES ('voice','org','sender',?,1,'2026-10-24T10:00:00.000Z')",
    args: [sid],
  });
  await client.execute(
    "INSERT INTO whatsapp_connections (id,organization_id,provider,status,credentials,display_phone_number) VALUES ('sender','org','twilio','connected','cipher','+94766523362')",
  );
  await client.execute({
    sql: "INSERT INTO voice_phone_calls (id,organization_id,integration_id,provider,caller_number,started_at,created_at,captured_json) VALUES ('call','org','voice','elevenlabs','+971501111111','2026-10-24T11:00:00.000Z','2026-10-24T11:02:00.000Z',?)",
    args: [JSON.stringify(captured)],
  });
  await client.execute({
    sql: "INSERT INTO commerce_products (id,organization_id,name,status,product_url) VALUES ('product','org','One Book','active',?)",
    args: [url],
  });
  state.connection.mockResolvedValue({
    organizationId: "org",
    providerKey: "elevenlabs",
    status: "connected",
  });
  state.modules.mockResolvedValue(
    ["voice", "whatsapp", "integrations", "crm"].map((moduleKey) => ({
      moduleKey,
      status: "enabled",
    })),
  );
  state.approval.mockResolvedValue({
    body: "Hi {{1}}, here is your requested book: {{2}}",
    status: "approved",
    languageCode: "en",
  });
  state.send.mockResolvedValue({
    externalMessageId: "SMtest",
    status: "queued",
  });
  state.access.mockResolvedValue(undefined);
});
describe("consented per-call book-link follow-up", () => {
  it("uses the confirmed number, approved template and authoritative catalogue URL", async () => {
    expect(await send()).toBe("queued");
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(state.send.mock.calls[0][1]).toBe("+971501111111");
    expect(state.send.mock.calls[0][2]).toEqual({
      name: "voice_call_followup",
      languageCode: "en",
      externalTemplateId: sid,
      variables: { "1": "Walid", "2": url },
      statusCallbackUrl: "https://du.example/api/whatsapp/sender",
    });
    const message = (await client.execute("SELECT * FROM whatsapp_messages"))
      .rows[0];
    expect(message.id).toBe("voice-book-link:call");
    expect(message.external_message_id).toBe("SMtest");
    expect(message.body).toBe("Hi Walid, here is your requested book: " + url);
  });
  it("uses Worker-compatible manual redirects for the message request", async () => {
    const network = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.redirect).toBe("manual");
        return Response.json({ sid: "MMtest", status: "queued" });
      },
    );
    vi.stubGlobal("fetch", network);
    state.send.mockImplementationOnce(
      async (_sender, _recipient, _template, fetcher: typeof fetch) => {
        const response = await fetcher("https://api.twilio.com/test", {
          method: "POST",
        });
        expect(response.ok).toBe(true);
        return { externalMessageId: "MMtest", status: "queued" };
      },
    );
    try {
      expect(await send()).toBe("queued");
      expect(network).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("atomically sends once under concurrent requests and subsequent retries", async () => {
    await Promise.all(Array.from({ length: 8 }, () => send()));
    await send();
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(
      (await client.execute("SELECT id FROM whatsapp_messages")).rows,
    ).toHaveLength(1);
  });
  it("allows a separate consented request on another call by the same customer", async () => {
    await send();
    await client.execute(
      "INSERT INTO voice_phone_calls SELECT 'call-2',organization_id,integration_id,provider,external_conversation_id,external_agent_id,agent_name,direction,caller_number,called_number,started_at,duration_seconds,summary,call_successful,recording_url,captured_json,transcript_json,contact_id,lead_id,welcome_status,book_link_status,book_link_message_id,recap_email_status,created_at FROM voice_phone_calls WHERE id='call'",
    );
    await service.send("org", "voice", "call-2");
    expect(state.send).toHaveBeenCalledTimes(2);
  });
  it.each(["false", "", "yes"])(
    "does not treat %j as explicit consent",
    async (value) => {
      await fields({ whatsapp_link_consent: value });
      expect(await send()).toContain("consent");
      expect(state.send).not.toHaveBeenCalled();
    },
  );
  it("does not replace consent with an offer-accepted flag", async () => {
    await fields({
      whatsapp_link_consent: "",
      whatsapp_offer_accepted: "true",
    });
    await send();
    expect(state.send).not.toHaveBeenCalled();
  });
  it("uses a different WhatsApp number only when the caller explicitly confirms that preference", async () => {
    await fields({
      whatsapp_preference: "different number",
      whatsapp_number: "+94771111111",
      callback_details: "+94772222222",
    });
    await send();
    expect(state.send.mock.calls[0][1]).toBe("+94771111111");
  });
  it("does not substitute callback details or an unconfirmed destination", async () => {
    await fields({
      whatsapp_preference: "different number",
      whatsapp_number: "",
      callback_details: "+94772222222",
    });
    expect(await send()).toContain("destination");
    expect(state.send).not.toHaveBeenCalled();
  });
  it.each([
    "http://books.example/products/one",
    "https://attacker.example/pay",
    "https://user:secret@books.example/products/one",
  ])("rejects an unsafe or non-catalogue URL %s", async (link) => {
    await fields({ requested_product_url: link });
    await send();
    expect(state.send).not.toHaveBeenCalled();
  });
  it("does not use another workspace catalogue entry or an archived product", async () => {
    await client.execute(
      "UPDATE commerce_products SET organization_id='other'",
    );
    await send();
    expect(state.send).not.toHaveBeenCalled();
    await client.execute(
      "UPDATE commerce_products SET organization_id='org',status='archived'",
    );
    await send();
    expect(state.send).not.toHaveBeenCalled();
  });
  it("does not send when the template is paused or cannot be verified", async () => {
    state.approval.mockResolvedValue({ status: "paused" });
    await send();
    expect(state.send).not.toHaveBeenCalled();
    state.approval.mockRejectedValue(new Error("provider unavailable"));
    await send();
    expect(state.send).not.toHaveBeenCalled();
  });
  it("honors opt-out before reserving a message", async () => {
    await client.execute(
      "INSERT INTO whatsapp_conversations (id,organization_id,connection_id,external_conversation_id,opted_out_at) VALUES ('chat','org','sender','+971501111111','2026-10-24')",
    );
    await send();
    expect(state.send).not.toHaveBeenCalled();
    expect(
      (await client.execute("SELECT id FROM whatsapp_messages")).rows,
    ).toHaveLength(0);
  });
  it("never resends when provider acceptance is uncertain", async () => {
    state.send.mockRejectedValue(new Error("timeout after provider accepted"));
    expect(await send()).toContain("unknown");
    await send();
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(
      (await client.execute("SELECT status FROM whatsapp_messages")).rows[0]
        .status,
    ).toBe("unknown");
  });
  it("does not replay historical calls during activation or webhook retries", async () => {
    await client.execute(
      "UPDATE voice_phone_calls SET started_at='2026-10-20T10:00:00.000Z'",
    );
    expect(await send()).toContain("predates");
    expect(state.send).not.toHaveBeenCalled();
  });
  it("requires staff permission for a deliberate individual historical send", async () => {
    await client.execute(
      "UPDATE voice_phone_calls SET started_at='2026-10-20T10:00:00.000Z'",
    );
    state.access.mockRejectedValueOnce(new Error("forbidden"));
    await expect(service.sendManually("org", "user", "call")).rejects.toThrow(
      "forbidden",
    );
    expect(state.send).not.toHaveBeenCalled();
    state.access.mockResolvedValue(undefined);
    expect(await service.sendManually("org", "user", "call")).toBe("queued");
    await service.sendManually("org", "user", "call");
    expect(state.send).toHaveBeenCalledTimes(1);
  });
  it("refuses calls belonging to a different workspace or integration", async () => {
    await service.send("other", "voice", "call");
    await service.send("org", "different", "call");
    expect(state.send).not.toHaveBeenCalled();
  });
  it("does not send while disabled or when a required module is disabled", async () => {
    await client.execute("UPDATE voice_book_link_settings SET enabled=0");
    await send();
    expect(state.send).not.toHaveBeenCalled();
    await client.execute("UPDATE voice_book_link_settings SET enabled=1");
    state.modules.mockResolvedValue([]);
    await send();
    expect(state.send).not.toHaveBeenCalled();
  });
  it("handles malformed captured data without sending", async () => {
    await client.execute("UPDATE voice_phone_calls SET captured_json='broken'");
    expect(await send()).toContain("invalid");
    expect(state.send).not.toHaveBeenCalled();
  });
  it("preserves the activation cutoff when settings are saved again", async () => {
    await service.configure("org", "user", {
      connectionId: "voice",
      enabled: true,
      senderId: "sender",
      contentSid: sid,
    });
    expect(
      (await client.execute("SELECT started_at FROM voice_book_link_settings"))
        .rows[0].started_at,
    ).toBe("2026-10-24T10:00:00.000Z");
  });
  it("refuses to enable an unapproved template", async () => {
    state.approval.mockResolvedValue({ status: "pending" });
    await expect(
      service.configure("org", "user", {
        connectionId: "voice",
        enabled: true,
        senderId: "sender",
        contentSid: sid,
      }),
    ).rejects.toThrow("approved");
  });
  it("refuses a call without a trustworthy start time", async () => {
    await client.execute("UPDATE voice_phone_calls SET started_at=NULL");
    await send();
    expect(state.send).not.toHaveBeenCalled();
  });
  it("rechecks disablement after preflight and retains the claim so a retry cannot send", async () => {
    state.approval.mockImplementationOnce(async () => {
      await client.execute("UPDATE voice_book_link_settings SET enabled=0");
      return {
        body: "Hi {{1}}, link {{2}}",
        status: "approved",
        languageCode: "en",
      };
    });
    await send();
    expect(state.send).not.toHaveBeenCalled();
    expect(
      (await client.execute("SELECT status FROM whatsapp_messages")).rows[0]
        .status,
    ).toBe("failed");
    await client.execute("UPDATE voice_book_link_settings SET enabled=1");
    await send();
    expect(state.send).not.toHaveBeenCalled();
  });
});
