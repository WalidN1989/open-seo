import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  ORG_A,
  ORG_B,
  USER_OWNER_A,
  USER_OWNER_B,
  createTenancyFixture,
  type TestDb,
} from "./fixture";
import type * as AccountModule from "@/server/features/social/services/SocialAccountService";
import type * as SocialModule from "@/server/features/social/services/SocialService";
import type * as WebhookModule from "@/server/features/social/services/SocialWebhookService";
import type * as DbSchema from "@/db/schema";

const mockEnv = vi.hoisted(
  () => ({ DATABASE_PROVIDER: "d1" }) as { DATABASE_PROVIDER: string },
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

const APP_SECRET = "the-app-secret";
const calls: Array<{ url: string; body: string }> = [];
const fakeMeta: typeof fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  calls.push({ url, body: typeof init?.body === "string" ? init.body : "" });
  if (url.includes("/messages")) {
    return Response.json({ message_id: "mid.sent.1" });
  }
  return Response.json({ username: "reader_99", name: "Jane Doe" });
};

async function signed(rawBody: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  const hex = [...new Uint8Array(mac)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return new Headers({ "x-hub-signature-256": `sha256=${hex}` });
}

const IG_ACCOUNT = "17841400000000000";
const dm = (mid: string, text: string, isEcho = false) =>
  JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: IG_ACCOUNT,
        messaging: [
          {
            sender: { id: isEcho ? IG_ACCOUNT : "IGSID_CUSTOMER" },
            recipient: { id: IG_ACCOUNT },
            timestamp: 1_757_000_000_000,
            message: { mid, text, ...(isEcho ? { is_echo: true } : {}) },
          },
        ],
      },
    ],
  });

let db: TestDb;
let schema: typeof DbSchema;
let SocialAccountService: typeof AccountModule.SocialAccountService;
let SocialService: typeof SocialModule.SocialService;
let SocialWebhookService: typeof WebhookModule.SocialWebhookService;
let accountId: string;

beforeAll(async () => {
  vi.stubGlobal("fetch", fakeMeta);
  const fixture = await createTenancyFixture();
  db = fixture.db;
  vi.doMock("@/db", () => ({ db, withPgClient: (fn: () => unknown) => fn() }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  ({ SocialAccountService } =
    await import("@/server/features/social/services/SocialAccountService"));
  ({ SocialService } =
    await import("@/server/features/social/services/SocialService"));
  ({ SocialWebhookService } =
    await import("@/server/features/social/services/SocialWebhookService"));
  schema = await import("@/db/schema");
  await db
    .insert(schema.organizationModuleEntitlements)
    .values({
      id: "ent_social_a",
      organizationId: ORG_A,
      moduleKey: "social",
      status: "enabled",
    })
    .onConflictDoNothing();
});

afterAll(() => vi.unstubAllGlobals());

describe("connecting an Instagram account", () => {
  it("stores the secrets encrypted and never returns them", async () => {
    const account = await SocialAccountService.connect(ORG_A, USER_OWNER_A, {
      platform: "instagram",
      displayName: "BooXworm on Instagram",
      externalAccountId: IG_ACCOUNT,
      pageId: "PAGE_1",
      accessToken: "page-token",
      appSecret: APP_SECRET,
      verifyToken: "my-verify-token",
    });
    expect(account).toMatchObject({
      platform: "instagram",
      externalAccountId: IG_ACCOUNT,
      status: "connected",
      autopilot: false,
      hasCredentials: true,
    });
    expect(account && "credentials" in account).toBe(false);
    accountId = account!.id;
    const [row] = await db
      .select()
      .from(schema.socialAccounts)
      .where(eq(schema.socialAccounts.id, accountId));
    expect(row?.credentials).not.toContain("page-token");
    expect(row?.credentials).not.toContain(APP_SECRET);
  });

  it("refuses a token-less connection rather than saving one that cannot send", async () => {
    await expect(
      SocialAccountService.connect(ORG_A, USER_OWNER_A, {
        platform: "messenger",
        displayName: "No token",
        externalAccountId: "PAGE_NO_TOKEN",
        pageId: "PAGE_NO_TOKEN",
        appSecret: APP_SECRET,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("is invisible to another organization", async () => {
    await expect(
      SocialService.workspace(ORG_B, USER_OWNER_B),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("receiving a direct message", () => {
  it("refuses a delivery whose signature does not match the app secret", async () => {
    const body = dm("mid.1", "do you have this book?");
    const result = await SocialWebhookService.processWebhook(
      new Headers({ "x-hub-signature-256": "sha256=deadbeef" }),
      body,
    );
    expect(result.status).toBe(401);
  });

  it("mirrors a signed message once, and looks the sender's name up", async () => {
    const body = dm("mid.1", "do you have this book?");
    const first = await SocialWebhookService.processWebhook(
      await signed(body),
      body,
    );
    expect(first.status).toBe(200);
    // Meta retries; the same message id must not appear twice.
    await SocialWebhookService.processWebhook(await signed(body), body);

    const workspace = await SocialService.workspace(ORG_A, USER_OWNER_A);
    expect(workspace.conversations).toHaveLength(1);
    expect(workspace.conversations[0]).toMatchObject({
      participantId: "IGSID_CUSTOMER",
      participantName: "reader_99",
      status: "open",
    });
    const thread = await SocialService.thread(
      ORG_A,
      USER_OWNER_A,
      workspace.conversations[0].id,
    );
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0]).toMatchObject({
      direction: "inbound",
      body: "do you have this book?",
    });
    // No Claude connection in the fixture, so nothing was drafted.
    expect(workspace.drafts).toHaveLength(0);
  });

  it("ignores the account's own echoed message, so a reply cannot loop", async () => {
    const body = dm("mid.echo", "our own reply", true);
    const result = await SocialWebhookService.processWebhook(
      await signed(body),
      body,
    );
    expect(result.status).toBe(200);
    const thread = await SocialService.thread(
      ORG_A,
      USER_OWNER_A,
      (await SocialService.workspace(ORG_A, USER_OWNER_A)).conversations[0].id,
    );
    expect(thread.messages).toHaveLength(1);
  });
});

describe("replying", () => {
  it("sends through the Page with the stored token", async () => {
    const workspace = await SocialService.workspace(ORG_A, USER_OWNER_A);
    const conversationId = workspace.conversations[0].id;
    calls.length = 0;
    await SocialService.sendReply(ORG_A, USER_OWNER_A, {
      conversationId,
      text: "Yes — LKR 3,900, in stock.",
    });
    const send = calls.find((call) => call.url.includes("/messages"));
    expect(send?.url).toBe("https://graph.facebook.com/v21.0/PAGE_1/messages");
    expect(send?.body).toContain('"id":"IGSID_CUSTOMER"');
    const thread = await SocialService.thread(
      ORG_A,
      USER_OWNER_A,
      conversationId,
    );
    expect(thread.messages.map((message) => message.direction)).toEqual([
      "inbound",
      "outbound",
    ]);
    expect(thread.messages[1]).toMatchObject({
      externalMessageId: "mid.sent.1",
      authoredBy: USER_OWNER_A,
    });
  });
});
