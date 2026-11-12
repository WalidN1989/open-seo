import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type * as RepositoryModule from "./CommunicationsRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let Repository: typeof RepositoryModule.CommunicationsRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  await client.executeMultiple(`
    CREATE TABLE whatsapp_connections (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, provider TEXT NOT NULL,
      display_phone_number TEXT, phone_number_id TEXT, business_account_id TEXT,
      last_checked_at TEXT, last_error TEXT, external_account_id TEXT,
      credential_reference TEXT, credentials TEXT, status TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE whatsapp_templates (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, connection_id TEXT,
      name TEXT NOT NULL, language_code TEXT NOT NULL, category TEXT NOT NULL,
      body TEXT NOT NULL, media_url TEXT, external_template_id TEXT,
      status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE whatsapp_campaigns (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, connection_id TEXT,
      template_id TEXT, name TEXT NOT NULL, status TEXT NOT NULL,
      scheduled_at TEXT, started_at TEXT, completed_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE whatsapp_conversations (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, connection_id TEXT NOT NULL,
      contact_id TEXT, assigned_member_id TEXT, external_conversation_id TEXT,
      status TEXT NOT NULL, opted_out_at TEXT, reply_mode TEXT NOT NULL,
      reply_revision INTEGER NOT NULL, last_auto_reply_key TEXT,
      last_message_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE whatsapp_contact_profiles (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, contact_id TEXT NOT NULL,
      marketing_opt_in INTEGER NOT NULL, utility_opt_in INTEGER NOT NULL,
      use_whatsapp_name INTEGER NOT NULL, updated_at TEXT NOT NULL
    );
  `);
  ({ CommunicationsRepository: Repository } =
    await import("./CommunicationsRepository"));
});

afterAll(() => client.close());

beforeEach(async () => {
  for (const table of [
    "whatsapp_contact_profiles",
    "whatsapp_conversations",
    "whatsapp_campaigns",
    "whatsapp_templates",
    "whatsapp_connections",
  ]) {
    await client.execute(`DELETE FROM ${table}`);
  }
  await client.executeMultiple(`
    INSERT INTO whatsapp_connections VALUES
      ('connection', 'org', 'twilio', '+100', NULL, NULL, NULL, NULL, 'AC1', 'REF', NULL, 'connected', 'now', 'now');
    INSERT INTO whatsapp_templates VALUES
      ('template', 'org', 'connection', 'promotion', 'en', 'marketing', 'Hello {{1}}', NULL, 'HX1', 'approved', 'now', 'now');
    INSERT INTO whatsapp_campaigns VALUES
      ('campaign', 'org', 'connection', 'template', 'Launch', 'draft', NULL, NULL, NULL, 'now', 'now');
    INSERT INTO whatsapp_contact_profiles VALUES
      ('eligible-profile', 'org', 'eligible', 1, 0, 1, 'now'),
      ('stopped-profile', 'org', 'stopped', 1, 0, 1, 'now'),
      ('no-consent-profile', 'org', 'no-consent', 0, 0, 1, 'now');
    INSERT INTO whatsapp_conversations VALUES
      ('eligible-chat', 'org', 'connection', 'eligible', NULL, '+101', 'open', NULL, 'auto', 0, NULL, 'now', 'now'),
      ('stopped-chat', 'org', 'connection', 'stopped', NULL, '+102', 'open', 'now', 'auto', 0, NULL, 'now', 'now'),
      ('no-consent-chat', 'org', 'connection', 'no-consent', NULL, '+103', 'open', NULL, 'auto', 0, NULL, 'now', 'now');
  `);
});

describe("WhatsApp campaign audience and launch claim", () => {
  it("includes only marketing opt-ins who have not replied STOP", async () => {
    const context = await Repository.getWhatsappCampaignContext(
      "org",
      "campaign",
    );
    expect(context?.conversations.map((row) => row.id)).toEqual([
      "eligible-chat",
    ]);
  });

  it("allows only one request to claim a campaign", async () => {
    await expect(
      Repository.claimWhatsappCampaign("org", "campaign", "started"),
    ).resolves.toMatchObject({ status: "running", startedAt: "started" });
    await expect(
      Repository.claimWhatsappCampaign("org", "campaign", "later"),
    ).resolves.toBeNull();
  });

  it("rechecks STOP and marketing consent immediately before dispatch", async () => {
    await client.execute(
      "UPDATE whatsapp_conversations SET opted_out_at = 'now' WHERE id = 'eligible-chat'",
    );
    await expect(
      Repository.whatsappCampaignRecipientAllowed("org", "eligible-chat"),
    ).resolves.toBe(false);

    await client.execute(
      "UPDATE whatsapp_conversations SET opted_out_at = NULL WHERE id = 'eligible-chat'",
    );
    await client.execute(
      "UPDATE whatsapp_contact_profiles SET marketing_opt_in = 0 WHERE contact_id = 'eligible'",
    );
    await expect(
      Repository.whatsappCampaignRecipientAllowed("org", "eligible-chat"),
    ).resolves.toBe(false);
  });
});
