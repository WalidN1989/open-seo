import { createVoiceCaseTestClient } from "@/test/tenancy/voiceCaseDatabase";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { drizzle } from "drizzle-orm/libsql";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import * as schema from "@/db/business.schema";

const state = vi.hoisted(() => ({
  db: null as unknown,
  bookLink: vi.fn().mockResolvedValue("skipped: test"),
  welcome: vi.fn().mockResolvedValue("skipped: test"),
  recap: vi.fn().mockResolvedValue("skipped: test"),
  quote: vi.fn().mockResolvedValue("skipped: test"),
  ownerEmail: vi
    .fn<
      (
        org: string,
        input: { to: string; text: string },
      ) => Promise<{ messageId: string }>
    >()
    .mockResolvedValue({ messageId: "TEST-owner-summary" }),
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
vi.mock("./CallBookLinkService", () => ({
  CallBookLinkService: { send: state.bookLink },
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
vi.mock(
  "@/server/features/business-modules/repositories/BusinessModuleRepository",
  () => ({
    BusinessModuleRepository: {
      findOwner: async () => ({
        id: "TEST-owner-member",
        userId: "TEST-owner",
        email: "owner@example.invalid",
      }),
    },
  }),
);
vi.mock("@/server/features/email/services/EmailSendService", () => ({
  EmailSendService: { sendFromConnectedMailbox: state.ownerEmail },
}));
import { PhoneCallService } from "./PhoneCallService";

const { client, close } = createVoiceCaseTestClient();
beforeAll(async () => {
  state.db = drizzle(client);
  for (const table of [
    schema.businessSettings,
    schema.integrationConnections,
    schema.voicePhoneCalls,
    schema.voiceCaseCalls,
    schema.attentionHeads,
    schema.voiceCases,
    schema.whatsappMessages,
    schema.crmContacts,
    schema.crmLeads,
    schema.crmActivities,
    schema.crmCompanies,
    schema.crmPipelineStages,
    schema.customerActionRequests,
  ]) {
    const config = getTableConfig(table);
    await client.execute(
      `create table "${config.name}" (${config.columns.map((c) => `"${c.name}" ${c.getSQLType()}`).join(",")})`,
    );
  }
  await client.execute(
    "CREATE UNIQUE INDEX fixture_customer_action_id ON customer_action_requests(id)",
  );
  await client.execute(
    "CREATE UNIQUE INDEX fixture_attention_org ON attention_heads(organization_id)",
  );
  await client.execute(
    "CREATE UNIQUE INDEX fixture_case_conversation ON voice_case_calls(organization_id,external_conversation_id)",
  );
  await client.execute(
    "insert into business_settings (id,organization_id,currency) values ('au','test-southside-workspace','AUD')",
  );
  await client.execute(
    "insert into integration_connections (id,organization_id,provider_key,status,credentials) values ('au-line','test-southside-workspace','elevenlabs','connected','test')",
  );
});
afterAll(close);
beforeEach(async () => {
  vi.stubEnv("SOUTHSIDE_WORKFLOW_ORGANIZATION_ID", "test-southside-workspace");
  await client.execute("DELETE FROM customer_action_requests");
  vi.clearAllMocks();
  state.ownerEmail.mockResolvedValue({ messageId: "TEST-owner-summary" });
  state.welcome.mockResolvedValue("skipped: test");
  state.recap.mockResolvedValue("skipped: test");
  state.quote.mockResolvedValue("skipped: test");
  for (const table of [
    "attention_heads",
    "voice_case_calls",
    "voice_cases",
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
  captured: {
    customerPhone?: string;
    consent?: string;
    direction?: string;
    caseId?: string;
  } = {},
) {
  const raw = JSON.stringify({
    type: "post_call_transcription",
    data: {
      conversation_id: "test-conversation",
      conversation_initiation_client_data: {
        dynamic_variables: { case_id: captured.caseId },
      },
      metadata: {
        phone_call: {
          direction: captured.direction ?? "inbound",
          external_number: caller,
          agent_number: line,
        },
      },
      analysis: {
        data_collection_results: {
          ...(captured.consent === undefined
            ? {}
            : { whatsapp_link_consent: { value: captured.consent } }),
          caller_name: { value: "TEST Southside Caller" },
          caller_email: { value: "test@example.invalid" },
          whatsapp_preference: { value: "same_number" },
          service_interest: { value: "TEST 12m PVC fence" },
          quote_request: { value: "TEST quote requested" },
          callback_details: { value: callback },
          customer_phone_number: { value: captured.customerPhone },
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

describe("TEST Southside signed-call dry run — no live providers", () => {
  it("creates a lead, attempts confirmations, summarizes outcomes and drafts a quote once", async () => {
    state.welcome.mockResolvedValue("sent: TEST provider accepted");
    state.recap.mockResolvedValue("sent: TEST provider accepted");
    state.quote.mockResolvedValue(
      "drafted TEST-Q-001: awaiting owner approval",
    );
    const first = await webhook(
      "au-line",
      "+61400000000",
      "+61485036520",
      "+61400000000",
    );
    expect(first).toEqual({ status: 200, body: "recorded" });
    expect(
      (await client.execute("SELECT title FROM crm_leads")).rows[0]?.title,
    ).toContain("TEST");
    expect(state.welcome).toHaveBeenCalledTimes(1);
    expect(state.recap).toHaveBeenCalledTimes(1);
    expect(state.quote).toHaveBeenCalledTimes(1);
    expect(state.ownerEmail).toHaveBeenCalledTimes(1);
    expect(state.ownerEmail.mock.calls[0]?.[0]).toBe(
      "test-southside-workspace",
    );
    expect(state.ownerEmail.mock.calls[0]?.[1].to).toBe(
      "owner@example.invalid",
    );
    expect(state.ownerEmail.mock.calls[0]?.[1].text).toContain(
      "TEST provider accepted",
    );
    expect(
      (
        await client.execute("SELECT status FROM customer_action_requests")
      ).rows.every((row) => row.status === "completed"),
    ).toBe(true);
    expect(
      await webhook("au-line", "+61400000000", "+61485036520", "+61400000000"),
    ).toEqual({ status: 200, body: "duplicate" });
    expect(state.welcome).toHaveBeenCalledTimes(1);
    expect(state.recap).toHaveBeenCalledTimes(1);
    expect(state.ownerEmail).toHaveBeenCalledTimes(1);
  });
  it("keeps a failed confirmation visible and still notifies the owner", async () => {
    state.welcome.mockResolvedValue("failed: TEST WhatsApp rejected");
    state.recap.mockResolvedValue("failed: TEST email rejected");
    state.quote.mockResolvedValue("skipped: no quote requested");
    await webhook("au-line", "+61400000000", "+61485036520", "+61400000000");
    const failed = (
      await client.execute(
        "SELECT error FROM customer_action_requests WHERE status='attention'",
      )
    ).rows;
    expect(failed).toHaveLength(2);
    expect(state.ownerEmail.mock.calls[0]?.[1].text).toContain(
      "failed: TEST email rejected",
    );
  });
});
