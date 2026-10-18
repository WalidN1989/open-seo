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
import { getTableConfig } from "drizzle-orm/sqlite-core";
import * as schema from "@/db/business.schema";

const state = vi.hoisted(() => ({
  db: null as unknown,
  welcome: vi.fn().mockResolvedValue("skipped: test"),
  recap: vi.fn().mockResolvedValue("skipped: test"),
  quote: vi.fn().mockResolvedValue("skipped: test"),
}));
vi.mock("@/db", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@/db/schema", async () => import("@/db/business.schema"));
vi.mock("@/server/lib/connection-secrets", () => ({
  decryptCredentials: async () => ({
    WEBHOOK_SECRET: "test-webhook",
    CALLER_LOOKUP_SECRET: "test-lookup",
  }),
}));
vi.mock(
  "@/server/features/business-modules/repositories/BusinessAuditRepository",
  () => ({
    BusinessAuditRepository: { record: vi.fn() },
  }),
);
vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({
    BusinessModuleService: { requireAccess: vi.fn() },
  }),
);
vi.mock("@/server/features/crm/services/CrmService", () => ({
  CrmService: { ensureStages: async () => [] },
}));
vi.mock("./CallWelcomeService", () => ({
  CallWelcomeService: { sendWelcome: state.welcome },
}));
vi.mock("./CallRecapService", () => ({
  CallRecapService: { sendCallRecap: state.recap },
}));
vi.mock("./CallQuoteService", () => ({
  CallQuoteService: { quoteFromCall: state.quote },
}));
import { PhoneCallService } from "./PhoneCallService";
import { CallerLookupService } from "./CallerLookupService";

const client = createClient({ url: ":memory:" });
beforeAll(async () => {
  state.db = drizzle(client);
  for (const table of [
    schema.businessSettings,
    schema.integrationConnections,
    schema.voicePhoneCalls,
    schema.crmContacts,
    schema.crmLeads,
    schema.crmActivities,
  ]) {
    const config = getTableConfig(table);
    await client.execute(
      `create table "${config.name}" (${config.columns.map((c) => `"${c.name}" ${c.getSQLType()}`).join(",")})`,
    );
  }
  await client.execute(
    "insert into business_settings (id,organization_id,currency) values ('lk','org-lk','LKR'),('au','org-au','AUD')",
  );
  await client.execute(
    "insert into integration_connections (id,organization_id,provider_key,status,credentials) values ('lk-line','org-lk','elevenlabs','connected','test'),('au-line','org-au','elevenlabs','connected','test')",
  );
});
afterAll(() => client.close());
beforeEach(async () => {
  state.welcome.mockResolvedValue("skipped: test");
  state.recap.mockResolvedValue("skipped: test");
  state.quote.mockResolvedValue("skipped: test");
  for (const table of [
    "voice_phone_calls",
    "crm_contacts",
    "crm_leads",
    "crm_activities",
  ])
    await client.execute(`delete from ${table}`);
});

async function webhook(
  connection: string,
  caller?: string,
  line?: string,
  callback?: string,
  customerPhone?: string,
) {
  const raw = JSON.stringify({
    type: "post_call_transcription",
    data: {
      conversation_id: "test-conversation",
      metadata: {
        phone_call: {
          direction: "inbound",
          external_number: caller,
          agent_number: line,
        },
      },
      analysis: {
        data_collection_results: {
          caller_name: { value: "Test Caller" },
          callback_details: { value: callback },
          customer_phone_number: { value: customerPhone },
        },
      },
    },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("test-webhook"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${raw}`),
  );
  const hex = [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return PhoneCallService.processElevenLabsWebhook(
    connection,
    new Headers({ "elevenlabs-signature": `t=${timestamp},v0=${hex}` }),
    raw,
  );
}

async function savedPhone() {
  return (await client.execute("select caller_number from voice_phone_calls"))
    .rows[0]?.caller_number;
}

describe("workspace-aware phone calls and CRM", () => {
  it("saves a first-time website caller's explicitly captured customer phone", async () => {
    await webhook("lk-line", undefined, undefined, undefined, "0761234567");
    expect(await savedPhone()).toBe("+94761234567");
    expect(
      (await client.execute("select first_name,phone from crm_contacts")).rows,
    ).toMatchObject([{ first_name: "Test", phone: "+94761234567" }]);
  });
  it("stores a national caller on a Sri Lankan line as +94 in the call, contact and WhatsApp recipient", async () => {
    expect(await webhook("lk-line", "0761234567", "+94110000000")).toEqual({
      status: 200,
      body: "recorded",
    });
    expect(await savedPhone()).toBe("+94761234567");
    expect(
      (await client.execute("select phone,whatsapp_phone from crm_contacts"))
        .rows,
    ).toMatchObject([
      { phone: "+94761234567", whatsapp_phone: "+94761234567" },
    ]);
    expect(state.welcome).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-lk",
        recipient: "+94761234567",
      }),
    );
    expect(await webhook("lk-line", "0761234567", "+94110000000")).toEqual({
      status: 200,
      body: "duplicate",
    });
    expect(
      (await client.execute("select count(*) as total from crm_contacts"))
        .rows[0]?.total,
    ).toBe(1);
  });

  it("uses the called Sri Lankan line even in an AUD workspace", async () => {
    await webhook("au-line", "0761234567", "+94110000000");
    expect(await savedPhone()).toBe("+94761234567");
  });

  it("uses LKR for local callback digits when a widget has no caller id or line", async () => {
    await webhook("lk-line", undefined, undefined, "0761234567 after lunch");
    expect(await savedPhone()).toBe("+94761234567");
    expect(state.welcome).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: "+94761234567" }),
    );
  });

  it("uses the Sri Lankan called line for a callback when the caller country is unrecognised", async () => {
    await webhook("lk-line", "+19410000000", "+94110000000", "0761234567");
    expect(state.welcome).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: "+94761234567" }),
    );
  });

  it("keeps an explicit Australian caller and callback in the LKR workspace", async () => {
    await webhook("lk-line", "+61400123456", "+94110000000", "+61400987654");
    expect(await savedPhone()).toBe("+61400123456");
    expect(state.welcome).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: "+61400987654" }),
    );
  });

  it("preserves local Australian calls in AUD workspaces", async () => {
    await webhook("au-line", "0400123456");
    expect(await savedPhone()).toBe("+61400123456");
  });

  it("recognises a returning Sri Lankan caller by a national id without exposing another tenant's contact", async () => {
    await client.execute(
      "insert into crm_contacts (id,organization_id,first_name,phone) values ('foreign','org-au','Foreign','+94761234567'),('local','org-lk','Nimal','+94761234567')",
    );
    const result = await CallerLookupService.lookupCaller(
      "lk-line",
      new Headers({ "x-openseo-secret": "test-lookup" }),
      JSON.stringify({ caller_id: "0761234567" }),
    );
    expect(result).toMatchObject({
      status: 200,
      body: {
        dynamic_variables: { caller_known: "yes", caller_first_name: "Nimal" },
      },
    });
  });

  it("rejects unsigned deliveries and caller lookups before reading CRM data", async () => {
    expect(
      await PhoneCallService.processElevenLabsWebhook(
        "lk-line",
        new Headers(),
        "{}",
      ),
    ).toEqual({ status: 401, body: "bad signature" });
    expect(
      await CallerLookupService.lookupCaller("lk-line", new Headers(), "{}"),
    ).toMatchObject({ status: 401 });
    expect(
      (await client.execute("select count(*) as total from crm_contacts"))
        .rows[0]?.total,
    ).toBe(0);
    expect(state.welcome).not.toHaveBeenCalled();
  });
});
