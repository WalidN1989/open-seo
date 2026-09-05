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
import type * as EmailModule from "@/server/features/email/services/EmailService";
import type * as WebhookModule from "@/server/features/email/services/EmailWebhookService";
import type * as AccountModule from "@/server/features/email/services/EmailAccountService";
import type * as DbSchema from "@/db/schema";

const mockEnv = vi.hoisted(
  () => ({ DATABASE_PROVIDER: "d1" }) as { DATABASE_PROVIDER: string },
);
vi.mock("cloudflare:workers", () => ({ env: mockEnv }));

const envMocks = vi.hoisted(() => ({
  values: {
    BETTER_AUTH_SECRET: "a-test-signing-secret",
    BETTER_AUTH_URL: "https://seo.example.com/",
  } as Record<string, string>,
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

const WEBHOOK_SECRET = "whsec_" + btoa("email-module-test-secret-32bytes!");
const calls: Array<{
  method: string;
  path: string;
  auth: string | null;
  body: unknown;
}> = [];

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseBody(body: BodyInit | null | undefined): Record<string, unknown> {
  if (typeof body !== "string") return {};
  const parsed: unknown = JSON.parse(body);
  return isRecord(parsed) ? parsed : {};
}

/** A stand-in AgentMail: records every call and answers like the real API. */
const fakeAgentmail: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  const path = url.pathname.replace(/^\/v0/, "");
  const body = parseBody(init?.body);
  calls.push({
    method: init?.method ?? "GET",
    path,
    auth: new Headers(init?.headers).get("authorization"),
    body,
  });
  if (path === "/pods" && init?.method === "GET")
    return json({
      pods: [{ pod_id: "pod_old", name: "Other", client_id: "someone-else" }],
    });
  if (path === "/pods") return json({ pod_id: "pod_1", name: body.name });
  if (path === "/pods/pod_1/inboxes")
    return json({
      pod_id: "pod_1",
      inbox_id: "inbox_1",
      email: `${typeof body.username === "string" ? body.username : "auto"}@agentmail.to`,
    });
  if (path === "/pods/pod_1/api-keys")
    return json({
      api_key_id: "key_1",
      api_key: "am_pod_scoped_key",
      prefix: "am_",
    });
  if (path === "/webhooks")
    return json({
      webhook_id: "wh_1",
      url: body.url,
      secret: WEBHOOK_SECRET,
      enabled: true,
    });
  if (/^\/inboxes\/inbox_1\/messages\/[^/]+\/reply$/.test(path))
    return json({ message_id: "<reply-1@agentmail.to>", thread_id: "thd_1" });
  if (path === "/inboxes/inbox_1/messages/send")
    return json({ message_id: "<sent-1@agentmail.to>", thread_id: "thd_new" });
  return json({ message: `unexpected ${path}` }, 404);
};

async function signed(body: string, id = "msg_1") {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const raw = Uint8Array.from(atob(WEBHOOK_SECRET.slice(6)), (c) =>
    c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  return new Headers({
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${btoa(String.fromCharCode(...new Uint8Array(sig)))}`,
  });
}

let db: TestDb;
let schema: typeof DbSchema;
let EmailService: typeof EmailModule.EmailService;
let EmailWebhookService: typeof WebhookModule.EmailWebhookService;
let EmailAccountService: typeof AccountModule.EmailAccountService;
let accountId: string;

beforeAll(async () => {
  vi.stubGlobal("fetch", fakeAgentmail);
  const fixture = await createTenancyFixture();
  db = fixture.db;
  vi.doMock("@/db", () => ({ db, withPgClient: (fn: () => unknown) => fn() }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  ({ EmailService } =
    await import("@/server/features/email/services/EmailService"));
  ({ EmailAccountService } =
    await import("@/server/features/email/services/EmailAccountService"));
  ({ EmailWebhookService } =
    await import("@/server/features/email/services/EmailWebhookService"));
  schema = await import("@/db/schema");
  await db
    .insert(schema.organizationModuleEntitlements)
    .values({
      id: "ent_email_a",
      organizationId: ORG_A,
      moduleKey: "email",
      status: "enabled",
    })
    .onConflictDoNothing();
});

afterAll(() => vi.unstubAllGlobals());

describe("connecting AgentMail", () => {
  it("creates a pod, an inbox in it, a pod key and a webhook, and keeps only the scoped secrets", async () => {
    const account = await EmailAccountService.connectAgentmail(
      ORG_A,
      USER_OWNER_A,
      {
        apiKey: "am_org_level_key",
        displayName: "Period.lk",
        username: "hello",
      },
    );
    expect(account).toMatchObject({
      provider: "agentmail",
      address: "hello@agentmail.to",
      podId: "pod_1",
      inboxId: "inbox_1",
      webhookId: "wh_1",
      status: "connected",
      hasCredentials: true,
    });
    expect(account && "credentials" in account).toBe(false);
    accountId = account!.id;
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /pods",
      "POST /pods",
      "POST /pods/pod_1/inboxes",
      "POST /pods/pod_1/api-keys",
      "POST /webhooks",
    ]);
    expect(calls.every((c) => c.auth === "Bearer am_org_level_key")).toBe(true);
    expect(calls[4]?.body).toMatchObject({
      url: `https://seo.example.com/api/email/${accountId}`,
      inbox_ids: ["inbox_1"],
    });
    const [row] = await db
      .select()
      .from(schema.emailAccounts)
      .where(eq(schema.emailAccounts.id, accountId));
    expect(row?.credentials).not.toContain("am_org_level_key");
    expect(row?.credentials).not.toContain("am_pod_scoped_key");
  });

  it("is invisible to another organization", async () => {
    await expect(
      EmailService.workspace(ORG_B, USER_OWNER_B),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("receiving and replying", () => {
  const received = JSON.stringify({
    type: "event",
    event_type: "message.received",
    event_id: "evt_1",
    message: {
      inbox_id: "inbox_1",
      thread_id: "thd_1",
      message_id: "<cust-1@example.com>",
      timestamp: "2026-09-05T10:00:00Z",
      from: "Nimal Perera <nimal@example.com>",
      to: ["Period.lk <hello@agentmail.to>"],
      subject: "Do you deliver to Kandy?",
      text: "Hi, do you deliver to Kandy and how long does it take?",
    },
    thread: {
      inbox_id: "inbox_1",
      thread_id: "thd_1",
      timestamp: "2026-09-05T10:00:00Z",
      senders: ["Nimal Perera <nimal@example.com>"],
      recipients: ["Period.lk <hello@agentmail.to>"],
      subject: "Do you deliver to Kandy?",
      preview: "Hi, do you deliver to Kandy",
      message_count: 1,
    },
  });

  it("rejects a webhook whose signature does not match the account's secret", async () => {
    const headers = await signed(received);
    headers.set("svix-signature", "v1,AAAA");
    const result = await EmailWebhookService.processWebhook(
      accountId,
      headers,
      received,
    );
    expect(result.status).toBe(401);
  });

  it("mirrors a signed message once, then lets a person reply on the thread", async () => {
    const first = await EmailWebhookService.processWebhook(
      accountId,
      await signed(received),
      received,
    );
    expect(first.status).toBe(200);
    const again = await EmailWebhookService.processWebhook(
      accountId,
      await signed(received, "msg_2"),
      received,
    );
    expect(again.status).toBe(200);

    const workspace = await EmailService.workspace(ORG_A, USER_OWNER_A);
    expect(workspace.threads).toHaveLength(1);
    expect(workspace.threads[0]).toMatchObject({
      subject: "Do you deliver to Kandy?",
      senders: ["Nimal Perera <nimal@example.com>"],
      status: "open",
    });
    const threadId = workspace.threads[0]?.id ?? "";
    const before = await EmailService.thread(ORG_A, USER_OWNER_A, threadId);
    expect(before.messages).toHaveLength(1);
    expect(before.messages[0]).toMatchObject({
      direction: "inbound",
      status: "received",
    });
    // No Claude connection in the fixture, so no draft was written.
    expect(workspace.drafts).toHaveLength(0);

    calls.length = 0;
    await EmailService.sendReply(ORG_A, USER_OWNER_A, {
      threadId,
      text: "Yes — Kandy is 2 working days.",
    });
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/inboxes/inbox_1/messages/${encodeURIComponent("<cust-1@example.com>")}/reply`,
      auth: "Bearer am_pod_scoped_key",
    });
    const after = await EmailService.thread(ORG_A, USER_OWNER_A, threadId);
    expect(after.messages.map((m) => m.direction)).toEqual([
      "inbound",
      "outbound",
    ]);
    expect(after.messages[1]).toMatchObject({
      externalMessageId: "<reply-1@agentmail.to>",
      status: "sent",
      authoredBy: USER_OWNER_A,
    });
  });

  it("marks delivery from a later event", async () => {
    const delivered = JSON.stringify({
      type: "event",
      event_type: "message.delivered",
      event_id: "evt_2",
      send: {
        inbox_id: "inbox_1",
        thread_id: "thd_1",
        message_id: "<reply-1@agentmail.to>",
      },
    });
    const result = await EmailWebhookService.processWebhook(
      accountId,
      await signed(delivered, "msg_3"),
      delivered,
    );
    expect(result.status).toBe(200);
    const [row] = await db
      .select({ status: schema.emailMessages.status })
      .from(schema.emailMessages)
      .where(
        eq(schema.emailMessages.externalMessageId, "<reply-1@agentmail.to>"),
      );
    expect(row?.status).toBe("delivered");
  });
});
