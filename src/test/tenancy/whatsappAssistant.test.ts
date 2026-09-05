import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  ORG_A,
  ORG_B,
  USER_OWNER_A,
  WHATSAPP_A,
  createTenancyFixture,
  type TestDb,
} from "./fixture";
import type * as AssistantModule from "@/server/features/communications/services/WhatsappAssistantService";
import type * as ReplyModule from "@/server/features/communications/services/WhatsappAssistantReplyService";
import type * as AssistantRepoModule from "@/server/features/communications/repositories/WhatsappAssistantRepository";
import type * as RepositoryModule from "@/server/features/communications/repositories/CommunicationsRepository";
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

const sent = vi.hoisted(() => ({
  calls: [] as Array<{ recipient: string; body: string }>,
  total: 0,
}));
vi.mock("@/server/features/communications/providers/whatsapp", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/features/communications/providers/whatsapp")
  >("@/server/features/communications/providers/whatsapp");
  return {
    ...actual,
    sendWhatsappText: async (
      _connection: unknown,
      recipient: string,
      body: string,
    ) => {
      sent.calls.push({ recipient, body });
      sent.total += 1;
      return { externalMessageId: `wamid.${sent.total}`, status: "sent" };
    },
  };
});

let db: TestDb;
let schema: typeof DbSchema;
let WhatsappAssistantService: typeof AssistantModule.WhatsappAssistantService;
let replyToInbound: typeof ReplyModule.replyToInbound;
let Repo: typeof AssistantRepoModule.WhatsappAssistantRepository;
let CommunicationsRepository: typeof RepositoryModule.CommunicationsRepository;
let connection: NonNullable<
  Awaited<
    ReturnType<
      typeof RepositoryModule.CommunicationsRepository.getWhatsappConnectionById
    >
  >
>;
let counter = 0;

async function inbound(body: string, sender = "+61400000099") {
  counter += 1;
  const message = {
    externalMessageId: `in.${counter}`,
    sender,
    body,
    messageType: "text",
    receivedAt: new Date().toISOString(),
  };
  const ingestion = await CommunicationsRepository.ingestWhatsappMessage(
    connection,
    message,
  );
  if (!ingestion.conversationId) throw new Error("no conversation");
  const handled = await replyToInbound(
    connection,
    ingestion.conversationId,
    message,
  );
  return { handled, conversationId: ingestion.conversationId };
}

beforeAll(async () => {
  const fixture = await createTenancyFixture();
  db = fixture.db;
  vi.doMock("@/db", () => ({ db, withPgClient: (fn: () => unknown) => fn() }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  ({ WhatsappAssistantService } =
    await import("@/server/features/communications/services/WhatsappAssistantService"));
  ({ CommunicationsRepository } =
    await import("@/server/features/communications/repositories/CommunicationsRepository"));
  ({ replyToInbound } =
    await import("@/server/features/communications/services/WhatsappAssistantReplyService"));
  ({ WhatsappAssistantRepository: Repo } =
    await import("@/server/features/communications/repositories/WhatsappAssistantRepository"));
  schema = await import("@/db/schema");
  const row =
    await CommunicationsRepository.getWhatsappConnectionById(WHATSAPP_A);
  if (!row) throw new Error("fixture connection missing");
  connection = row;
  // The assistant must not wait between messages in tests.
  await WhatsappAssistantService.updateSettings(ORG_A, USER_OWNER_A, {
    replyDelaySeconds: 0,
  });
});

beforeEach(() => {
  sent.calls.length = 0;
});

describe("instant answers", () => {
  it("answers an exact question with no model and counts nothing else", async () => {
    await WhatsappAssistantService.createInstantAnswer(ORG_A, USER_OWNER_A, {
      question: "Where are you based?",
      answer: "Oxley, Brisbane — with a delivery team in Colombo.",
    });
    const { handled } = await inbound("where are you based", "+61400000001");
    expect(handled).toBe(true);
    expect(sent.calls).toEqual([
      {
        recipient: "+61400000001",
        body: "Oxley, Brisbane — with a delivery team in Colombo.",
      },
    ]);
  });

  it("refuses a duplicate question with a message that names the fix", async () => {
    await expect(
      WhatsappAssistantService.createInstantAnswer(ORG_A, USER_OWNER_A, {
        question: "WHERE are you based?!",
        answer: "elsewhere",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("escalation and human takeover", () => {
  it("hands off once on a keyword, then stays silent while a person owns the chat", async () => {
    const first = await inbound("I want to speak to a HUMAN", "+61400000002");
    expect(first.handled).toBe(true);
    expect(sent.calls).toHaveLength(1);
    expect(sent.calls[0]?.body).toContain("team member");
    const [conversation] = await db
      .select({ status: schema.whatsappConversations.status })
      .from(schema.whatsappConversations)
      .where(eq(schema.whatsappConversations.id, first.conversationId));
    expect(conversation?.status).toBe("pending");

    const second = await inbound("hello?", "+61400000002");
    expect(second.handled).toBe(true);
    expect(sent.calls).toHaveLength(1);
  });
});

describe("questions people ask", () => {
  it("counts a repeated question once per ask", async () => {
    await inbound("Do you do Google Maps?", "+61400000003");
    await inbound("do you do google maps", "+61400000004");
    await inbound("thanks mate", "+61400000004");
    const rows = await db
      .select()
      .from(schema.whatsappAskedQuestions)
      .where(eq(schema.whatsappAskedQuestions.organizationId, ORG_A));
    const maps = rows.find(
      (row) => row.normalizedQuestion === "do you do google maps",
    );
    expect(maps?.askCount).toBe(2);
    expect(rows.some((row) => row.normalizedQuestion === "thanks mate")).toBe(
      false,
    );
  });
});

describe("autopilot", () => {
  it("leaves an ordinary message to the automation rules when Claude is not connected", async () => {
    const { handled } = await inbound("hello there friend", "+61400000005");
    expect(handled).toBe(false);
    expect(sent.calls).toHaveLength(0);
  });

  it("reports defaults for an organization with no saved row", async () => {
    const config = await WhatsappAssistantService.getConfig(
      ORG_A,
      USER_OWNER_A,
    );
    expect(config.settings.autopilot).toBe(true);
    expect(config.settings.escalationKeywords).toContain("human");
    expect(config.ai.connected).toBe(false);
  });
});

describe("catalogue lookup", () => {
  it("finds an item by any words of its name, with stock, inside its own organization only", async () => {
    const rows = await Repo.searchPricedProducts(ORG_A, "WIDGET alpha");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Alpha Widget",
      sku: "ALPHA-1",
      salePriceMinor: 150_000,
      quantityOnHand: 40,
    });
    expect(await Repo.searchPricedProducts(ORG_B, "alpha widget")).toEqual([]);
    expect(await Repo.searchPricedProducts(ORG_A, "nothing here")).toEqual([]);
  });
});
