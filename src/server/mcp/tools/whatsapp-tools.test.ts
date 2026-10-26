import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpHandler } from "agents/mcp/server";
import { createWorkersOAuthMcpProps } from "@/server/mcp/context";
const mocks = vi.hoisted(() => ({
  mode: vi.fn(),
  reply: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  memberships: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({ env: {}, waitUntil: vi.fn() }));
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: { listOrganizationIdsForUser: mocks.memberships },
}));
vi.mock(
  "@/server/features/communications/services/WhatsappAgentService",
  () => ({
    WhatsappAgentService: {
      setChatMode: mocks.mode,
      sendReply: mocks.reply,
      listChats: mocks.list,
      getChat: mocks.get,
    },
  }),
);
vi.mock("@/server/mcp/catalogue", async () => ({
  ALL_MCP_TOOLS: (await import("./whatsapp-tools")).whatsappSurface.tools,
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
import { createOpenSeoMcpServer } from "@/server/mcp/server";
const auth = createWorkersOAuthMcpProps({
  userId: "operator",
  userEmail: "operator@example.test",
  organizationId: "untrusted-context",
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
const call = (args: Record<string, unknown>) =>
  rpc("tools/call", { name: "set_whatsapp_chat_mode", arguments: args });
beforeEach(() => {
  mocks.memberships.mockResolvedValue(["workspace"]);
  mocks.mode.mockImplementation(
    async (
      _org: string,
      _user: string,
      input: { conversationId: string; mode: "auto" | "manual" },
    ) => ({
      conversationId: input.conversationId,
      replyMode: input.mode,
    }),
  );
  mocks.reply.mockResolvedValue({ id: "reply-id", status: "sent" });
  mocks.list.mockResolvedValue([
    {
      id: "chat",
      phone: "+10000000000",
      status: "open",
      replyMode: "manual",
      optedOut: false,
    },
  ]);
  mocks.get.mockResolvedValue({
    chat: { id: "chat", replyMode: "manual" },
    messages: [],
    templates: [],
  });
});
describe("WhatsApp MCP protocol", () => {
  it("discovers the tool, mode enum and persistent Manual behavior", async () => {
    const result = await rpc("tools/list");
    expect(result).toContain("set_whatsapp_chat_mode");
    expect(result).toContain('"auto","manual"');
    expect(result).toContain("Manual persists");
  });
  it("routes customer-care replies to the scoped service and documents Inbox parity", async () => {
    expect(await rpc("tools/list")).toContain("same policy as the Inbox");
    const result = await rpc("tools/call", {
      name: "send_whatsapp_reply",
      arguments: { conversationId: "chat", body: "Approved extra detail" },
    });
    expect(mocks.reply).toHaveBeenCalledWith("workspace", "operator", {
      conversationId: "chat",
      body: "Approved extra detail",
    });
    expect(result).toContain('"status":"sent"');
  });
  it("validates input before mutation", async () => {
    expect(await call({ conversationId: "chat", mode: "sometimes" })).toContain(
      "error",
    );
    expect(await call({ mode: "manual" })).toContain("error");
    expect(mocks.mode).not.toHaveBeenCalled();
  });
  it("resolves the caller's workspace and returns compact structured readback", async () => {
    const result = await call({ conversationId: "chat", mode: "manual" });
    expect(mocks.mode).toHaveBeenCalledWith("workspace", "operator", {
      conversationId: "chat",
      mode: "manual",
    });
    expect(result).toContain('"replyMode":"manual"');
    expect(result).toContain("No message sent.");
    expect(result.length).toBeLessThan(1500);
  });
  it("rejects unauthorized or ambiguous organization selection", async () => {
    expect(
      await call({
        organizationId: "other",
        conversationId: "chat",
        mode: "manual",
      }),
    ).toContain("FORBIDDEN");
    mocks.memberships.mockResolvedValue(["workspace", "second"]);
    expect(await call({ conversationId: "chat", mode: "manual" })).toContain(
      "organizationId",
    );
    expect(mocks.mode).not.toHaveBeenCalled();
  });
  it("includes mode in list/get text and structured output", async () => {
    const list = await rpc("tools/call", {
      name: "list_whatsapp_chats",
      arguments: {},
    });
    const get = await rpc("tools/call", {
      name: "get_whatsapp_chat",
      arguments: { conversationId: "chat" },
    });
    for (const result of [list, get])
      expect(result).toContain('"replyMode":"manual"');
    expect(list).toContain("replies manual");
    expect(get).toContain("Replies: manual.");
  });
});
