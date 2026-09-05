import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  ORG_A,
  USER_OWNER_A,
  WHATSAPP_A,
  createTenancyFixture,
  type TestDb,
} from "./fixture";
import type * as CommunicationsModule from "@/server/features/communications/services/CommunicationsService";
import type * as DbSchema from "@/db/schema";
import type * as WhatsappProvider from "@/server/features/communications/providers/whatsapp";

const mockEnv = vi.hoisted(
  () =>
    ({ DATABASE_PROVIDER: "d1" }) as {
      DATABASE_PROVIDER: string;
      AUTH_MODE?: string;
    },
);
vi.mock("cloudflare:workers", () => ({ env: mockEnv }));

const envMocks = vi.hoisted(() => ({
  values: { BETTER_AUTH_SECRET: "a-test-signing-secret" } as Record<
    string,
    string
  >,
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: (name: string) => Promise.resolve(envMocks.values[name]),
  getRequiredEnvValue: (name: string) => {
    const value = envMocks.values[name];
    if (!value)
      throw new Error(`Missing required environment variable: ${name}`);
    return Promise.resolve(value);
  },
  isHostedServerAuthMode: () => Promise.resolve(false),
}));

const TOKEN = "EAAG-a-real-looking-meta-access-token";

let db: TestDb;
let schema: typeof DbSchema;
let CommunicationsService: typeof CommunicationsModule.CommunicationsService;
let resolveCredential: typeof WhatsappProvider.resolveCredential;

async function storedRow(id: string) {
  const [row] = await db
    .select()
    .from(schema.whatsappConnections)
    .where(eq(schema.whatsappConnections.id, id));
  return row;
}

beforeAll(async () => {
  const fixture = await createTenancyFixture();
  db = fixture.db;
  vi.doMock("@/db", () => ({ db, withPgClient: (fn: () => unknown) => fn() }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  ({ CommunicationsService } =
    await import("@/server/features/communications/services/CommunicationsService"));
  ({ resolveCredential } =
    await import("@/server/features/communications/providers/whatsapp"));
  schema = await import("@/db/schema");
});

describe("a tenant's access token lives on its own connection", () => {
  it("stores the token encrypted, not in plain text", async () => {
    // Railway holds only the platform app secret and verify token. A token per
    // tenant there would mean a deployment variable and a redeploy each time.
    const created = await CommunicationsService.createWhatsappConnection(
      ORG_A,
      USER_OWNER_A,
      {
        provider: "meta_cloud",
        displayPhoneNumber: "+94110000011",
        phoneNumberId: "PN_ENC",
        businessAccountId: "WABA_ENC",
        accessToken: TOKEN,
      },
    );
    const row = await storedRow(created.id);
    expect(row.credentials).toBeTruthy();
    expect(row.credentials).not.toContain(TOKEN);
  });

  it("resolves the stored token for an outbound send", async () => {
    const [row] = await db
      .select()
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.phoneNumberId, "PN_ENC"));
    await expect(resolveCredential(row, "ACCESS_TOKEN")).resolves.toBe(TOKEN);
  });

  it("never returns the token, or the blob, to the browser", async () => {
    const workspace = await CommunicationsService.whatsappWorkspace(
      ORG_A,
      USER_OWNER_A,
    );
    const serialized = JSON.stringify(workspace.connections);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain("credentials");
  });

  it("tells the browser which credentials are set, without their values", async () => {
    const workspace = await CommunicationsService.whatsappWorkspace(
      ORG_A,
      USER_OWNER_A,
    );
    const connection = workspace.connections.find(
      (item) => item?.phoneNumberId === "PN_ENC",
    );
    expect(connection?.credentialKeysSet).toEqual(["ACCESS_TOKEN"]);
  });
});

describe("rotating a token", () => {
  it("keeps the stored token when the field is left blank", async () => {
    // The browser never receives it, so an untouched field arrives empty.
    // Treating that as "clear it" would break the connection on every rename.
    const [before] = await db
      .select()
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.phoneNumberId, "PN_ENC"));

    await CommunicationsService.updateWhatsappConnection(ORG_A, USER_OWNER_A, {
      connectionId: before.id,
      displayPhoneNumber: "+94110000012",
    });

    const [after] = await db
      .select()
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.id, before.id));
    expect(after.displayPhoneNumber).toBe("+94110000012");
    await expect(resolveCredential(after, "ACCESS_TOKEN")).resolves.toBe(TOKEN);
  });

  it("replaces a token that was actually retyped", async () => {
    const [before] = await db
      .select()
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.phoneNumberId, "PN_ENC"));

    await CommunicationsService.updateWhatsappConnection(ORG_A, USER_OWNER_A, {
      connectionId: before.id,
      accessToken: "EAAG-rotated",
    });

    const [after] = await db
      .select()
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.id, before.id));
    await expect(resolveCredential(after, "ACCESS_TOKEN")).resolves.toBe(
      "EAAG-rotated",
    );
  });

  it("refuses to touch another organization's connection", async () => {
    await expect(
      CommunicationsService.updateWhatsappConnection(ORG_A, USER_OWNER_A, {
        connectionId: "whatsapp_b",
        accessToken: "stolen",
      }),
    ).rejects.toThrow(/not found/i);
  });
});

describe("the self-hosted fallback is preserved", () => {
  it("falls back to the deployment variable when nothing is stored", async () => {
    // A self-hoster who prefers environment variables keeps working; the
    // stored credential simply takes precedence when present.
    envMocks.values.BOOXWORM_ACCESS_TOKEN = "from-the-deployment";
    const [row] = await db
      .select()
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.id, WHATSAPP_A));
    await db
      .update(schema.whatsappConnections)
      .set({ credentials: null, credentialReference: "BOOXWORM" })
      .where(eq(schema.whatsappConnections.id, row.id));

    const [updated] = await db
      .select()
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.id, row.id));
    await expect(resolveCredential(updated, "ACCESS_TOKEN")).resolves.toBe(
      "from-the-deployment",
    );
  });
});

describe("the key a connection's secret is stored under", () => {
  // Every Twilio path — send, template, webhook signature — resolves
  // AUTH_TOKEN, and every Meta path resolves ACCESS_TOKEN. Storing both as
  // ACCESS_TOKEN let a Twilio connection save cleanly and then fail on its
  // first message, with the secret encrypted under a name nothing read.
  // Asserting through resolveCredential exercises the sender's exact read.
  it("stores a Twilio auth token where the Twilio sender looks for it", async () => {
    const created = await CommunicationsService.createWhatsappConnection(
      ORG_A,
      USER_OWNER_A,
      {
        provider: "twilio",
        displayPhoneNumber: "+61400000001",
        externalAccountId: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        accessToken: "twilio-auth-token",
      },
    );
    await expect(resolveCredential(created, "AUTH_TOKEN")).resolves.toBe(
      "twilio-auth-token",
    );
  });

  it("keeps a Meta access token under ACCESS_TOKEN", async () => {
    const created = await CommunicationsService.createWhatsappConnection(
      ORG_A,
      USER_OWNER_A,
      {
        provider: "meta_cloud",
        displayPhoneNumber: "+94110000010",
        phoneNumberId: "PN_KEY_TEST",
        businessAccountId: "WABA_KEY_TEST",
        accessToken: "meta-access-token",
      },
    );
    await expect(resolveCredential(created, "ACCESS_TOKEN")).resolves.toBe(
      "meta-access-token",
    );
  });

  it("rotates a Twilio token into the same key, not the Meta one", async () => {
    const created = await CommunicationsService.createWhatsappConnection(
      ORG_A,
      USER_OWNER_A,
      {
        provider: "twilio",
        displayPhoneNumber: "+61400000002",
        externalAccountId: "ACyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy",
        accessToken: "first",
      },
    );
    await CommunicationsService.updateWhatsappConnection(ORG_A, USER_OWNER_A, {
      connectionId: created.id,
      accessToken: "rotated",
    });
    await expect(
      resolveCredential(await storedRow(created.id), "AUTH_TOKEN"),
    ).resolves.toBe("rotated");
  });

  it("keeps the stored number and account when an update leaves them blank", async () => {
    const created = await CommunicationsService.createWhatsappConnection(
      ORG_A,
      USER_OWNER_A,
      {
        provider: "twilio",
        displayPhoneNumber: "+61400000003",
        externalAccountId: "ACzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
      },
    );
    // Exactly what the update form sends when only the token is filled in.
    await CommunicationsService.updateWhatsappConnection(ORG_A, USER_OWNER_A, {
      connectionId: created.id,
      accessToken: "added-later",
      displayPhoneNumber: "",
      phoneNumberId: "",
      businessAccountId: "",
    });
    const row = await storedRow(created.id);
    expect(row.displayPhoneNumber).toBe("+61400000003");
    expect(row.externalAccountId).toBe("ACzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz");

    // Moving the number to another subaccount is an update, not a new
    // connection, so the conversations attached to it survive.
    await CommunicationsService.updateWhatsappConnection(ORG_A, USER_OWNER_A, {
      connectionId: created.id,
      externalAccountId: "ACmovedmovedmovedmovedmovedmovedmov",
    });
    const moved = await storedRow(created.id);
    expect(moved.externalAccountId).toBe("ACmovedmovedmovedmovedmovedmovedmov");
    expect(moved.displayPhoneNumber).toBe("+61400000003");
    await expect(resolveCredential(moved, "AUTH_TOKEN")).resolves.toBe(
      "added-later",
    );
    await expect(resolveCredential(row, "AUTH_TOKEN")).resolves.toBe(
      "added-later",
    );
  });
});

describe("more than one connection without a Meta phone number ID", () => {
  it("lets two Twilio numbers coexist when the form leaves the Meta IDs blank", async () => {
    const first = await CommunicationsService.createWhatsappConnection(
      ORG_A,
      USER_OWNER_A,
      {
        provider: "twilio",
        displayPhoneNumber: "+61400000010",
        externalAccountId: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        phoneNumberId: "",
        businessAccountId: "",
      },
    );
    const second = await CommunicationsService.createWhatsappConnection(
      ORG_A,
      USER_OWNER_A,
      {
        provider: "twilio",
        displayPhoneNumber: "+61400000011",
        externalAccountId: "ACbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        phoneNumberId: "",
        businessAccountId: "",
      },
    );
    expect(second.id).not.toBe(first.id);
    expect((await storedRow(first.id)).phoneNumberId).toBeNull();
  });

  it("explains a duplicate instead of failing with an internal error", async () => {
    const input = {
      provider: "meta_cloud" as const,
      displayPhoneNumber: "+94110000020",
      phoneNumberId: "PN_DUPLICATE",
      businessAccountId: "WABA_DUPLICATE",
    };
    await CommunicationsService.createWhatsappConnection(
      ORG_A,
      USER_OWNER_A,
      input,
    );
    await expect(
      CommunicationsService.createWhatsappConnection(
        ORG_A,
        USER_OWNER_A,
        input,
      ),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("Update connection"),
    });
  });
});
