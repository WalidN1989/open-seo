import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  ORG_A,
  ORG_B,
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

describe("signature verification", () => {
  it("rejects an unsigned delivery before parsing or any lookup", async () => {
    const body = delivery([
      {
        waba: "WABA_A",
        phoneNumberId: "PN_A",
        messages: [{ id: "m1", from: "94771", body: "hi" }],
      },
    ]);
    const result = await CommunicationsService.processMetaWebhook(
      body,
      new Headers(),
    );
    expect(result.status).toBe(401);
    expect(await messagesFor(ORG_A)).toHaveLength(0);
  });

  it("rejects a delivery signed with the wrong secret", async () => {
    const body = delivery([
      {
        waba: "WABA_A",
        phoneNumberId: "PN_A",
        messages: [{ id: "m1", from: "94771", body: "hi" }],
      },
    ]);
    const result = await CommunicationsService.processMetaWebhook(
      body,
      headersFor(await sign(body, "not-the-platform-secret")),
    );
    expect(result.status).toBe(401);
    expect(await messagesFor(ORG_A)).toHaveLength(0);
  });

  it("rejects malformed JSON that carries a valid signature", async () => {
    const body = "{not json";
    const result = await CommunicationsService.processMetaWebhook(
      body,
      headersFor(await sign(body)),
    );
    expect(result.status).toBe(400);
  });

  it("fails closed when the platform secret is absent", async () => {
    // Never fall through to processing an unverified payload.
    envMocks.values = {};
    const body = delivery([
      {
        waba: "WABA_A",
        phoneNumberId: "PN_A",
        messages: [{ id: "m1", from: "94771", body: "hi" }],
      },
    ]);
    await expect(
      CommunicationsService.processMetaWebhook(
        body,
        headersFor(await sign(body)),
      ),
    ).rejects.toThrow(/META_APP_SECRET/);
    expect(await messagesFor(ORG_A)).toHaveLength(0);
  });
});

describe("routing by payload identity", () => {
  it("delivers one phone number's message to its own organization", async () => {
    await post(
      delivery([
        {
          waba: "WABA_A",
          phoneNumberId: "PN_A",
          messages: [{ id: "m1", from: "94771", body: "hi" }],
        },
      ]),
    );
    expect(await messagesFor(ORG_A)).toHaveLength(1);
    expect(await messagesFor(ORG_B)).toHaveLength(0);
  });

  it("keeps several messages for one number together", async () => {
    await post(
      delivery([
        {
          waba: "WABA_A",
          phoneNumberId: "PN_A",
          messages: [
            { id: "m1", from: "94771", body: "one" },
            { id: "m2", from: "94771", body: "two" },
          ],
        },
      ]),
    );
    expect(await messagesFor(ORG_A)).toHaveLength(2);
  });

  it("splits a mixed payload across the organizations it belongs to", async () => {
    // The case that makes flattening unsafe: one delivery, two tenants.
    // Processing it all under the first phone_number_id would write B's
    // message into A.
    await post(
      delivery([
        {
          waba: "WABA_A",
          phoneNumberId: "PN_A",
          messages: [{ id: "m1", from: "94771", body: "for A" }],
        },
        {
          waba: "WABA_B",
          phoneNumberId: "PN_B",
          messages: [{ id: "m2", from: "94772", body: "for B" }],
        },
      ]),
    );
    const a = await messagesFor(ORG_A);
    const b = await messagesFor(ORG_B);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].body).toBe("for A");
    expect(b[0].body).toBe("for B");
  });

  it("ignores an unknown phone number id", async () => {
    const result = await post(
      delivery([
        {
          waba: "WABA_X",
          phoneNumberId: "PN_UNKNOWN",
          messages: [{ id: "m1", from: "94771", body: "hi" }],
        },
      ]),
    );
    expect(result.body).toBe("ignored");
    expect(await messagesFor(ORG_A)).toHaveLength(0);
    expect(await messagesFor(ORG_B)).toHaveLength(0);
  });

  it("refuses a number claimed by the wrong business account", async () => {
    await post(
      delivery([
        {
          waba: "WABA_B",
          phoneNumberId: "PN_A",
          messages: [{ id: "m1", from: "94771", body: "hi" }],
        },
      ]),
    );
    expect(await messagesFor(ORG_A)).toHaveLength(0);
  });

  it("ignores a delivery with no routing metadata at all", async () => {
    const body = JSON.stringify({
      entry: [
        {
          id: "WABA_A",
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "m1",
                    from: "94771",
                    type: "text",
                    text: { body: "hi" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const result = await CommunicationsService.processMetaWebhook(
      body,
      headersFor(await sign(body)),
    );
    expect(result.status).toBe(200);
    expect(await messagesFor(ORG_A)).toHaveLength(0);
  });

  it("does not deliver to a connection explicitly placed in error", async () => {
    await db
      .update(schema.whatsappConnections)
      .set({ status: "error" })
      .where(eq(schema.whatsappConnections.id, WHATSAPP_A));

    await post(
      delivery([
        {
          waba: "WABA_A",
          phoneNumberId: "PN_A",
          messages: [{ id: "m1", from: "94771", body: "hi" }],
        },
      ]),
    );
    expect(await messagesFor(ORG_A)).toHaveLength(0);

    await db
      .update(schema.whatsappConnections)
      .set({ status: "connected" })
      .where(eq(schema.whatsappConnections.id, WHATSAPP_A));
  });
});

describe("the legacy URL is not the authority", () => {
  it("writes to the payload's tenant, not the URL's", async () => {
    // A valid shared-app signature aimed at another tenant's callback URL.
    // This is the attack the connection-id route allowed.
    await post(
      delivery([
        {
          waba: "WABA_A",
          phoneNumberId: "PN_A",
          messages: [{ id: "m1", from: "94771", body: "hi" }],
        },
      ]),
      WHATSAPP_B,
    );
    expect(await messagesFor(ORG_A)).toHaveLength(1);
    expect(await messagesFor(ORG_B)).toHaveLength(0);
  });

  it("records the disagreement without acting on it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await post(
      delivery([
        {
          waba: "WABA_A",
          phoneNumberId: "PN_A",
          messages: [{ id: "m1", from: "94771", body: "hi" }],
        },
      ]),
      WHATSAPP_B,
    );
    const logged = warn.mock.calls.find(
      (call) => call[0] === "whatsapp.webhook.url_connection_mismatch",
    );
    expect(logged).toBeDefined();
    // The evidence names the ids, never a secret or a message body.
    expect(JSON.stringify(logged)).not.toContain("hi");
    expect(JSON.stringify(logged)).not.toContain(APP_SECRET);
    warn.mockRestore();
  });
});

describe("replay", () => {
  it("stores one message however many times it is delivered", async () => {
    const body = delivery([
      {
        waba: "WABA_A",
        phoneNumberId: "PN_A",
        messages: [{ id: "m1", from: "94771", body: "hi" }],
      },
    ]);
    await post(body);
    await post(body);
    await post(body);
    expect(await messagesFor(ORG_A)).toHaveLength(1);
  });

  it("survives concurrent delivery of the same event", async () => {
    const body = delivery([
      {
        waba: "WABA_A",
        phoneNumberId: "PN_A",
        messages: [{ id: "m9", from: "94771", body: "hi" }],
      },
    ]);
    const results = await Promise.all([post(body), post(body)]);
    for (const result of results) expect(result.status).toBe(200);
    expect(await messagesFor(ORG_A)).toHaveLength(1);
  });
});

describe("subscription verification", () => {
  it("answers Meta's challenge with the platform token", async () => {
    await expect(
      CommunicationsService.verifyMetaWebhook("subscribe", VERIFY_TOKEN, "42"),
    ).resolves.toBe("42");
  });

  it("refuses a wrong token", async () => {
    await expect(
      CommunicationsService.verifyMetaWebhook("subscribe", "guessed", "42"),
    ).resolves.toBeNull();
  });

  it("fails closed when the verify token is absent", async () => {
    envMocks.values = {};
    await expect(
      CommunicationsService.verifyMetaWebhook("subscribe", "anything", "42"),
    ).rejects.toThrow(/META_VERIFY_TOKEN/);
  });
});

describe("a connection that predates Phase 1", () => {
  it("routes immediately after migration, with nothing configured by hand", async () => {
    // The migration copies external_account_id into phone_number_id, so a
    // number connected before Phase 1 keeps receiving messages between deploy
    // and manual configuration rather than silently going dark.
    const legacyOrg = ORG_B;
    await db
      .update(schema.whatsappConnections)
      .set({
        phoneNumberId: "PN_LEGACY",
        externalAccountId: "PN_LEGACY",
        // Never backfilled: the old schema held no trustworthy WABA id.
        businessAccountId: null,
      })
      .where(eq(schema.whatsappConnections.id, WHATSAPP_B));

    await post(
      delivery([
        {
          waba: "WABA_UNKNOWN_TO_US",
          phoneNumberId: "PN_LEGACY",
          messages: [{ id: "legacy1", from: "94773", body: "hello" }],
        },
      ]),
    );

    // The WABA cross-check stays conditional, so an unconfigured
    // business_account_id does not block delivery.
    expect(await messagesFor(legacyOrg)).toHaveLength(1);

    await db
      .update(schema.whatsappConnections)
      .set({ phoneNumberId: "PN_B", businessAccountId: "WABA_B" })
      .where(eq(schema.whatsappConnections.id, WHATSAPP_B));
  });
});
