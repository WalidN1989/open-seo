import { DEFAULT_WHATSAPP_RESPONSES } from "@/shared/whatsapp-ai-configuration";
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
import { createMcpHandler } from "agents/mcp/server";
import { createWorkersOAuthMcpProps } from "@/server/mcp/context";
import {
  createWhatsappAiSettingsDatabase,
  createWhatsappAiSettingsTestClient,
} from "@/test/tenancy/whatsappAiSettingsDatabase";
import { AppError } from "@/server/lib/errors";
const state = vi.hoisted(() => ({
  db: null as unknown,
  access: vi.fn(),
  memberships: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({ env: {}, waitUntil: vi.fn() }));
vi.mock("@/db", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@/db/schema", async () => ({
  ...(await import("@/db/business.schema")),
  ...(await import("@/db/better-auth-schema")),
}));
vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({ BusinessModuleService: { requireAccess: state.access } }),
);
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: { listOrganizationIdsForUser: state.memberships },
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
vi.mock("@/server/mcp/catalogue", async () => ({
  ALL_MCP_TOOLS: (await import("@/server/mcp/tools/whatsapp-ai-settings-tools"))
    .whatsappAiSettingsSurface.tools,
}));
vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: vi.fn(),
  captureServerError: vi.fn(),
}));
vi.mock("@/server/lib/self-host-telemetry", () => ({
  incrementSelfHostMcpToolCallCount: vi.fn(),
}));
vi.mock("@/server/features/activation/mcpActivation", () => ({
  recordExternalMcpToolCall: vi.fn(),
}));
import { WhatsappAiSettingsService as Service } from "./services/WhatsappAiSettingsService";
import { WhatsappAiSettingsRepository as Repo } from "./repositories/WhatsappAiSettingsRepository";
import { createOpenSeoMcpServer } from "@/server/mcp/server";

const { client, close } = createWhatsappAiSettingsTestClient();
const auth = createWorkersOAuthMcpProps({
  userId: "operator",
  userEmail: "operator@example.test",
  organizationId: "untrusted",
  baseUrl: "https://local.test",
  clientId: null,
  scopes: ["mcp"],
});
async function rpc(method: string, params: Record<string, unknown> = {}) {
  const handler = createMcpHandler(() => createOpenSeoMcpServer(auth), {
    route: "/mcp",
  });
  const response = await handler(
    new Request("https://local.test/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
    {},
    { props: {}, waitUntil() {}, passThroughOnException() {} },
  );
  expect(response.status).toBe(200);
  return response.text();
}
const call = (name: string, args: Record<string, unknown> = {}) =>
  rpc("tools/call", { name, arguments: args });
const get = () => Service.get("a", "operator");
const count = async (table: string) =>
  (await client.execute(`SELECT count(*) AS n FROM ${table}`)).rows[0]?.n;
beforeAll(async () => {
  state.db = drizzle(client);
  await createWhatsappAiSettingsDatabase(
    (sql) => client.execute(sql),
    "sqlite",
  );
});
afterAll(close);
beforeEach(async () => {
  state.access.mockReset().mockResolvedValue(undefined);
  state.memberships.mockReset().mockResolvedValue(["a"]);
  await client.execute("DROP TRIGGER IF EXISTS reject_audit");
  await client.execute("DELETE FROM business_audit_events");
  await client.execute("DELETE FROM whatsapp_assistant_settings");
});
describe("WhatsApp settings MCP and atomic versions", () => {
  it("discovers exactly four added tools and validates actions before writing", async () => {
    const result = await rpc("tools/list");
    for (const name of [
      "get_whatsapp_ai_settings",
      "update_whatsapp_ai_settings",
      "list_whatsapp_ai_settings_history",
      "restore_whatsapp_ai_settings_version",
    ])
      expect(result).toContain(name);
    expect(
      await call("update_whatsapp_ai_settings", {
        expectedRevision: "0".repeat(64),
        appendRule: "one",
        instructions: "two",
      }),
    ).toContain("isError");
    expect(
      await call("update_whatsapp_ai_settings", {
        expectedRevision: "0".repeat(64),
      }),
    ).toContain("isError");
    expect(await count("whatsapp_assistant_settings")).toBe(0);
  });
  it("reads real defaults without writes and explicitly names the resolved workspace", async () => {
    const settings = await get();
    expect(settings).toMatchObject({
      workspace: { id: "a", name: "Workspace A" },
      instructions: null,
      autopilot: true,
      workspaceReplyMode: "auto",
      newChatReplyMode: "auto",
    });
    expect(settings.effectiveHandoffMessage).toContain("Our team");
    expect(await count("whatsapp_assistant_settings")).toBe(0);
    expect(await count("business_audit_events")).toBe(0);
    const result = await call("get_whatsapp_ai_settings");
    expect(result).toContain('"structuredContent"');
    expect(result).toContain("Workspace A");
    expect(state.access).toHaveBeenCalledWith(
      "a",
      "operator",
      "whatsapp",
      "manage",
    );
  });
  it("denies foreign workspaces and requires an explicit selector for multiple memberships", async () => {
    expect(
      await call("get_whatsapp_ai_settings", { organizationId: "b" }),
    ).toContain("FORBIDDEN");
    state.memberships.mockResolvedValue(["a", "b"]);
    expect(await call("get_whatsapp_ai_settings")).toContain("organizationId");
    expect(
      await call("get_whatsapp_ai_settings", { organizationId: "b" }),
    ).toContain("Workspace B");
  });
  it("requires WhatsApp manage for every read/write and never falls back to other modules", async () => {
    state.access.mockRejectedValue(new AppError("FORBIDDEN"));
    await expect(get()).rejects.toThrow("FORBIDDEN");
    await expect(
      Service.history("a", "viewer", { limit: 10, offset: 0 }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      Service.update("a", "viewer", {
        expectedRevision: "0".repeat(64),
        appendRule: "No",
      }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      Service.restore("a", "viewer", {
        expectedRevision: "0".repeat(64),
        versionId: crypto.randomUUID(),
        side: "before",
      }),
    ).rejects.toThrow("FORBIDDEN");
    expect(
      state.access.mock.calls.every(
        (args) => args[2] === "whatsapp" && args[3] === "manage",
      ),
    ).toBe(true);
    expect(await count("whatsapp_assistant_settings")).toBe(0);
  });
  it("backs up append/replace with actor identity and restores before text without deleting history", async () => {
    const first = await Service.update("a", "operator", {
      expectedRevision: (await get()).revision,
      instructions: "Original\nKeep whitespace.\n",
      handoffMessage: "The team will help.",
      replyStyle: "Use a detailed warm tone.",
      responseMessages: {
        ...DEFAULT_WHATSAPP_RESPONSES,
        imageUnavailable: "Please describe the picture.",
      },
    });
    const second = await Service.update("a", "editor", {
      expectedRevision: first.revision,
      appendRule: "A new rule.",
    });
    expect(second.after.instructions).toBe(
      "Original\nKeep whitespace.\n\n\nA new rule.",
    );
    expect(second.before).toEqual(first.after);
    expect(second.after.handoffMessage).toBe("The team will help.");
    expect((await get()).effectiveHandoffMessage).toBe("The team will help.");
    expect((await get()).effectiveReplyStyle).toBe("Use a detailed warm tone.");
    expect((await get()).effectiveResponseMessages.imageUnavailable).toBe(
      "Please describe the picture.",
    );
    expect(second.versionId).not.toBeNull();
    const history = await Service.history("a", "operator", {
      versionId: second.versionId ?? "",
      limit: 10,
      offset: 0,
    });
    expect(history.versions[0]).toMatchObject({
      actorUserId: "editor",
      before: first.after,
      after: second.after,
    });
    const restored = await Service.restore("a", "operator", {
      versionId: second.versionId ?? "",
      expectedRevision: second.revision,
      side: "before",
    });
    expect(restored.after).toEqual(first.after);
    expect(await count("business_audit_events")).toBe(3);
    await Service.restore("a", "operator", {
      versionId: first.versionId ?? "",
      expectedRevision: restored.revision,
      side: "before",
    });
    expect((await get()).instructions).toBeNull();
    expect((await get()).effectiveHandoffMessage).toContain("Our team");
    expect(await count("business_audit_events")).toBe(4);
  });
  it("refuses foreign versions, stale writes and stale restores", async () => {
    const original = await get();
    const changed = await Service.update("a", "operator", {
      expectedRevision: original.revision,
      instructions: "Changed",
    });
    await expect(
      Service.update("a", "operator", {
        expectedRevision: original.revision,
        appendRule: "Stale",
      }),
    ).rejects.toThrow("Settings changed");
    await expect(
      Service.restore("b", "operator", {
        versionId: changed.versionId ?? "",
        expectedRevision: (await Service.get("b", "operator")).revision,
        side: "before",
      }),
    ).rejects.toThrow("not found in this workspace");
    await expect(
      Service.restore("a", "operator", {
        versionId: changed.versionId ?? "",
        expectedRevision: original.revision,
        side: "before",
      }),
    ).rejects.toThrow("Settings changed");
    expect(await count("business_audit_events")).toBe(1);
  });
  it("preserves all unrelated settings, prevents oversized appends and returns no-op without an extra version", async () => {
    await client.execute(
      "INSERT INTO whatsapp_assistant_settings(organization_id,autopilot,persona,business_facts,booking_link,model,handoff_content_sid,contact_email) VALUES ('a',0,'Original','Keep facts','https://example.test/book','existing-model','template','test@example.test')",
    );
    const before = (
      await client.execute("SELECT * FROM whatsapp_assistant_settings")
    ).rows[0];
    const settings = await get();
    expect(settings.workspaceReplyMode).toBe("manual");
    const changed = await Service.update("a", "operator", {
      expectedRevision: settings.revision,
      appendRule: "Rule",
    });
    const after = (
      await client.execute("SELECT * FROM whatsapp_assistant_settings")
    ).rows[0];
    expect({
      ...after,
      persona: before?.persona,
      updated_at: before?.updated_at,
    }).toEqual(before);
    const noop = await Service.update("a", "operator", {
      expectedRevision: changed.revision,
      instructions: changed.after.instructions,
    });
    expect(noop.changed).toBe(false);
    expect(await count("business_audit_events")).toBe(1);
    await expect(
      Service.update("a", "operator", {
        expectedRevision: changed.revision,
        appendRule: "x".repeat(6000),
      }),
    ).rejects.toThrow();
    expect(await count("business_audit_events")).toBe(1);
  });
  it("backs up a later handoff edit before restoring all versioned writing fields", async () => {
    const changed = await Service.update("a", "operator", {
      expectedRevision: (await get()).revision,
      instructions: "New instructions",
    });
    await client.execute(
      "UPDATE whatsapp_assistant_settings SET handoff_message='Later stored value' WHERE organization_id='a'",
    );
    const restored = await Service.restore("a", "operator", {
      versionId: changed.versionId ?? "",
      expectedRevision: (await get()).revision,
      side: "before",
    });
    expect(restored.after).toEqual({
      instructions: null,
      handoffMessage: null,
      replyStyle: null,
      responseMessages: null,
    });
    expect(restored.before.handoffMessage).toBe("Later stored value");
  });
  it("rolls back settings and initialization if the backup audit fails", async () => {
    await client.execute(
      "CREATE TRIGGER reject_audit BEFORE INSERT ON business_audit_events BEGIN SELECT RAISE(ABORT,'backup unavailable'); END",
    );
    await expect(
      Service.update("a", "operator", {
        expectedRevision: (await get()).revision,
        appendRule: "Rule",
      }),
    ).rejects.toThrow("Could not confirm the settings change");
    expect(await count("whatsapp_assistant_settings")).toBe(0);
    expect(await count("business_audit_events")).toBe(0);
  });
  it("rejects a competing write inside the repository and creates no misleading version", async () => {
    const original = {
      instructions: null,
      handoffMessage: null,
      replyStyle: null,
      responseMessages: null,
    };
    await Service.update("a", "operator", {
      expectedRevision: (await get()).revision,
      instructions: "Winning edit",
    });
    expect(
      await Repo.change({
        organizationId: "a",
        actorUserId: "other",
        before: original,
        after: { ...original, instructions: "Losing edit" },
        operation: "update",
        expectedResponseMessagesJson: null,
      }),
    ).toBeNull();
    expect((await get()).instructions).toBe("Winning edit");
    expect(await count("business_audit_events")).toBe(1);
  });
  it("paginates compact history and reads old text only on request", async () => {
    let settings = await get();
    for (let n = 0; n < 3; n++) {
      await Service.update("a", "operator", {
        expectedRevision: settings.revision,
        appendRule: `Rule ${n}`,
      });
      settings = await get();
    }
    const page = await Service.history("a", "operator", {
      limit: 2,
      offset: 0,
    });
    expect(page.versions).toHaveLength(2);
    expect(page.nextOffset).toBe(2);
    expect(page.versions[0]).not.toHaveProperty("before");
    expect(
      (
        await Service.history("a", "operator", {
          limit: 2,
          offset: page.nextOffset ?? 0,
        })
      ).versions,
    ).toHaveLength(1);
  });
});
