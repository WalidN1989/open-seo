import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  CONTACT_A,
  ORG_A,
  ORG_B,
  USER_OWNER_A,
  USER_OWNER_B,
  createTenancyFixture,
  type TestDb,
} from "./fixture";
import { expectDenied } from "./expectDenied";
import type * as DbSchema from "@/db/schema";
import type * as SmsServiceModule from "@/server/features/sms/services/SmsService";
import type * as SmsWebhookModule from "@/server/features/sms/services/SmsWebhookService";

// Real in-memory SQLite, migrated from drizzle/, as in crossTenantAccess.
const mockEnv = vi.hoisted(() => ({ DATABASE_PROVIDER: "d1" }));
vi.mock("cloudflare:workers", () => ({ env: mockEnv }));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: (name: string) =>
    Promise.resolve(
      name === "BETTER_AUTH_URL" ? "https://app.test" : undefined,
    ),
  getRequiredEnvValue: () =>
    Promise.resolve("test-secret-at-least-thirty-two-characters-long"),
  isHostedServerAuthMode: () => Promise.resolve(false),
}));

const SMS_A = "sms_connection_a";
const SMS_B = "sms_connection_b";
const PHONE = "+61412345678";

let db: TestDb;
let schema: typeof DbSchema;
let SmsService: typeof SmsServiceModule.SmsService;
let SmsWebhookService: typeof SmsWebhookModule.SmsWebhookService;

/** Twilio's signature: HMAC-SHA1 over the URL and the sorted form fields. */
async function twilioSignature(
  url: string,
  params: Record<string, string>,
  token: string,
) {
  const payload = Object.keys(params)
    .toSorted()
    .reduce((value, key) => `${value}${key}${params[key]}`, url);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

async function textIn(
  connectionId: string,
  body: string,
  token: string,
  sid: string,
) {
  const url = `https://app.test/api/sms/twilio/${connectionId}`;
  const params = {
    MessageSid: sid,
    SmsStatus: "received",
    From: PHONE,
    To: "+19412974258",
    Body: body,
    NumMedia: "0",
  };
  return SmsWebhookService.processTwilioSms(
    connectionId,
    url,
    new Headers({
      "x-twilio-signature": await twilioSignature(url, params, token),
    }),
    new URLSearchParams(params).toString(),
  );
}

async function conversationIn(organizationId: string) {
  const [row] = await db
    .select()
    .from(schema.smsConversations)
    .where(
      and(
        eq(schema.smsConversations.organizationId, organizationId),
        eq(schema.smsConversations.phone, PHONE),
      ),
    );
  return row ?? null;
}

beforeAll(async () => {
  const fixture = await createTenancyFixture();
  db = fixture.db;
  vi.doMock("@/db", () => ({ db, withPgClient: (fn: () => unknown) => fn() }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  schema = await import("@/db/schema");
  const { encryptCredentials } =
    await import("@/server/lib/connection-secrets");
  ({ SmsService } = await import("@/server/features/sms/services/SmsService"));
  ({ SmsWebhookService } =
    await import("@/server/features/sms/services/SmsWebhookService"));

  const now = new Date().toISOString();
  await db.insert(schema.organizationModuleEntitlements).values(
    [ORG_A, ORG_B].map((organizationId) => ({
      id: `ent_${organizationId}_sms`,
      organizationId,
      moduleKey: "sms",
      status: "enabled" as const,
      enabledAt: now,
      updatedAt: now,
    })),
  );
  await db.insert(schema.integrationConnections).values([
    {
      id: SMS_A,
      organizationId: ORG_A,
      providerKey: "twilio_sms",
      displayName: "Alpha SMS",
      status: "connected" as const,
      credentials: await encryptCredentials({
        ACCOUNT_SID: "AC_A",
        AUTH_TOKEN: "token-a",
        PHONE_NUMBER: "+19412974258",
      }),
      updatedAt: now,
    },
    {
      id: SMS_B,
      organizationId: ORG_B,
      providerKey: "twilio_sms",
      displayName: "Beta SMS",
      status: "connected" as const,
      credentials: await encryptCredentials({
        ACCOUNT_SID: "AC_B",
        AUTH_TOKEN: "token-b",
        PHONE_NUMBER: "+19412970000",
      }),
      updatedAt: now,
    },
  ]);
  await db
    .update(schema.crmContacts)
    .set({ phone: PHONE })
    .where(eq(schema.crmContacts.id, CONTACT_A));
});

describe("SMS module", () => {
  it("stores a text in the number's own workspace, on the matching contact", async () => {
    const result = await textIn(
      SMS_A,
      "Is my quote still valid?",
      "token-a",
      "SM1",
    );
    expect(result.status).toBe(200);
    const conversation = await conversationIn(ORG_A);
    expect(conversation?.contactId).toBe(CONTACT_A);
    expect(await conversationIn(ORG_B)).toBeNull();
    const thread = await SmsService.thread(
      ORG_A,
      USER_OWNER_A,
      conversation?.id ?? "",
    );
    expect(thread.messages.map((message) => message.body)).toEqual([
      "Is my quote still valid?",
    ]);
  });

  it("refuses a webhook not signed with that number's token", async () => {
    const result = await textIn(SMS_A, "forged", "token-b", "SM2");
    expect(result.status).toBe(401);
  });

  it("keeps one workspace out of another's texts", async () => {
    const conversation = await conversationIn(ORG_A);
    await expectDenied(() =>
      SmsService.thread(ORG_B, USER_OWNER_B, conversation?.id ?? ""),
    );
    await expectDenied(() =>
      SmsService.send(ORG_B, USER_OWNER_B, {
        conversationId: conversation?.id,
        body: "hi",
      }),
    );
  });

  it("stops an agent following up again within a day of an unanswered text", async () => {
    const conversation = await conversationIn(ORG_A);
    await db
      .update(schema.smsConversations)
      .set({
        lastInboundAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
        lastOutboundAt: new Date(Date.now() - 3_600_000).toISOString(),
      })
      .where(eq(schema.smsConversations.id, conversation?.id ?? ""));
    await expect(
      SmsService.agentSend(ORG_A, USER_OWNER_A, {
        conversationId: conversation?.id ?? "",
        body: "Just checking in",
      }),
    ).rejects.toThrow(/haven't answered/);
  });

  it("blocks every text to a number that replied STOP", async () => {
    expect((await textIn(SMS_A, "STOP", "token-a", "SM3")).status).toBe(200);
    const conversation = await conversationIn(ORG_A);
    expect(conversation?.optedOutAt).toBeTruthy();
    await expect(
      SmsService.send(ORG_A, USER_OWNER_A, {
        conversationId: conversation?.id,
        body: "Are you still keen?",
      }),
    ).rejects.toThrow(/replied STOP/);
  });
});
