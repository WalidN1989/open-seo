import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  ORG_A,
  WHATSAPP_A,
  WHATSAPP_B,
  createTenancyFixture,
  type TestDb,
} from "./fixture";
import type * as CommunicationsModule from "@/server/features/communications/services/CommunicationsService";
import type * as DbSchema from "@/db/schema";
import { delivery, headersFor, sign } from "./metaWebhookHarness";

const mockEnv = vi.hoisted(
  () =>
    ({ DATABASE_PROVIDER: "d1" }) as {
      DATABASE_PROVIDER: string;
      AUTH_MODE?: string;
    },
);
vi.mock("cloudflare:workers", () => ({ env: mockEnv }));

const APP_SECRET = "platform-app-secret";
const VERIFY_TOKEN = "platform-verify-token";

const envMocks = vi.hoisted(() => ({ values: {} as Record<string, string> }));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: (name: string) => Promise.resolve(envMocks.values[name]),
  getRequiredEnvValue: (name: string) => {
    const value = envMocks.values[name];
    // Fail closed: a missing platform secret must stop the request, never
    // fall through to an unverified payload.
    if (!value)
      throw new Error(`Missing required environment variable: ${name}`);
    return Promise.resolve(value);
  },
  isHostedServerAuthMode: () => Promise.resolve(false),
}));

let db: TestDb;
let CommunicationsService: typeof CommunicationsModule.CommunicationsService;
let schema: typeof DbSchema;

async function post(body: string, urlConnectionId?: string) {
  return CommunicationsService.processMetaWebhook(
    body,
    headersFor(await sign(body)),
    urlConnectionId,
  );
}

async function messagesFor(organizationId: string) {
  return db
    .select()
    .from(schema.whatsappMessages)
    .where(eq(schema.whatsappMessages.organizationId, organizationId));
}

beforeAll(async () => {
  const fixture = await createTenancyFixture();
  db = fixture.db;
  vi.doMock("@/db", () => ({ db, withPgClient: (fn: () => unknown) => fn() }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  ({ CommunicationsService } =
    await import("@/server/features/communications/services/CommunicationsService"));
  schema = await import("@/db/schema");

  // Give each tenant's connection its Meta identifiers.
  await db
    .update(schema.whatsappConnections)
    .set({ phoneNumberId: "PN_A", businessAccountId: "WABA_A" })
    .where(eq(schema.whatsappConnections.id, WHATSAPP_A));
  await db
    .update(schema.whatsappConnections)
    .set({ phoneNumberId: "PN_B", businessAccountId: "WABA_B" })
    .where(eq(schema.whatsappConnections.id, WHATSAPP_B));
});

beforeEach(async () => {
  envMocks.values = {
    META_APP_SECRET: APP_SECRET,
    META_VERIFY_TOKEN: VERIFY_TOKEN,
  };
  await db.delete(schema.whatsappMessages);
  await db.delete(schema.whatsappConversations);
});

describe("creating a connection that can actually receive", () => {
  it("refuses a Meta connection with no phone number id", async () => {
    // Without it the row looks configured and silently receives nothing.
    // Better to refuse at creation than to debug a dead number later.
    await expect(
      CommunicationsService.createWhatsappConnection(ORG_A, "user_owner_a", {
        provider: "meta_cloud",
        displayPhoneNumber: "+94110000009",
      }),
    ).rejects.toThrow(/phone number ID/i);
  });

  it("accepts a Meta connection that carries its identifiers", async () => {
    const created = await CommunicationsService.createWhatsappConnection(
      ORG_A,
      "user_owner_a",
      {
        provider: "meta_cloud",
        displayPhoneNumber: "+94110000009",
        phoneNumberId: "PN_NEW",
        businessAccountId: "WABA_NEW",
      },
    );
    expect(created?.phoneNumberId).toBe("PN_NEW");
    expect(created?.organizationId).toBe(ORG_A);
  });

  it("routes to a connection created through the normal path", async () => {
    // End to end: created self-service, then reachable by an inbound webhook
    // without anyone touching the database.
    await db
      .update(schema.whatsappConnections)
      .set({ status: "connected" })
      .where(eq(schema.whatsappConnections.phoneNumberId, "PN_NEW"));

    await post(
      delivery([
        {
          waba: "WABA_NEW",
          phoneNumberId: "PN_NEW",
          messages: [{ id: "new1", from: "94779", body: "hello" }],
        },
      ]),
    );
    const messages = await messagesFor(ORG_A);
    expect(messages).toHaveLength(1);
  });

  it("still allows a Twilio connection without a phone number id", async () => {
    // Twilio is not routed by phone_number_id and never will be.
    const created = await CommunicationsService.createWhatsappConnection(
      ORG_A,
      "user_owner_a",
      { provider: "twilio", externalAccountId: "ACxxxx" },
    );
    expect(created?.provider).toBe("twilio");
  });
});
