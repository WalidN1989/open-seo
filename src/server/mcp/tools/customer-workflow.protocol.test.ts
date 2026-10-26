import { describe, expect, it, vi } from "vitest";
import { createMcpHandler } from "agents/mcp/server";
const mocks = vi.hoisted(() => ({ request: vi.fn(), execute: vi.fn() }));
vi.mock("@/server/mcp/catalogue", async () => {
  const { customerWorkflowSurface } = await import("./customer-workflow-tools");
  return { ALL_MCP_TOOLS: customerWorkflowSurface.tools };
});
vi.mock("@/server/mcp/instrumentation", () => ({
  instrumentMcpToolHandler: (
    _name: string,
    _schema: unknown,
    handler: unknown,
  ) => handler,
}));
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: {
    listOrganizationIdsForUser: async () => ["TEST-workspace"],
  },
}));
vi.mock(
  "@/server/features/customer-workflow/services/CustomerActionService",
  () => ({
    CustomerActionService: { request: mocks.request, execute: mocks.execute },
  }),
);
vi.mock(
  "@/server/features/customer-workflow/services/CommunicationReportService",
  () => ({
    CommunicationReportService: {
      read: async () => ({
        generatedAt: "TEST",
        since: "TEST",
        days: 7,
        calls: { total: 0 },
        channels: {},
        attention: [],
        requests: [],
        deliveryReports: { reports: [] },
        recentCalls: [],
        recentEmails: [],
        recentWhatsapp: [],
        recentSms: [],
        draftQuotes: [],
        notes: [],
      }),
    },
  }),
);
vi.mock("@/server/features/crm/services/CrmService", () => ({
  CrmService: {},
}));
vi.mock("@/server/features/crm/repositories/LeadDetailRepository", () => ({
  LeadDetailRepository: {},
}));
vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({ BusinessModuleService: {} }),
);
import { createOpenSeoMcpServer } from "@/server/mcp/server";
import { createWorkersOAuthMcpProps } from "@/server/mcp/context";
const props = createWorkersOAuthMcpProps({
  userId: "TEST-watcher",
  userEmail: "test@example.invalid",
  organizationId: "TEST-workspace",
  baseUrl: "https://example.invalid",
});
async function rpc(method: string, params?: unknown) {
  const handler = createMcpHandler(() => createOpenSeoMcpServer(props), {
    route: "/mcp",
  });
  const response = await handler(
    new Request("https://example.invalid/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
    {},
    { waitUntil() {}, passThroughOnException() {}, props: {} },
  );
  expect(response.status).toBe(200);
  return response.text();
}
describe("customer workflow JSON-RPC transport", () => {
  it("discovers tools while withholding an approval capability", async () => {
    const text = await rpc("tools/list");
    expect(text).toContain("get_communications_report");
    expect(text).toContain("request_customer_action");
    expect(text).not.toContain('"name":"approve_customer_action"');
  });
  it("returns a bounded empty report without a provider or model call", async () => {
    const text = await rpc("tools/call", {
      name: "get_communications_report",
      arguments: {},
    });
    expect(text).toContain("detailsMayBeTruncated");
    expect(text).not.toContain('"isError":true');
    expect(text.length).toBeLessThan(4000);
  });
  it("serializes needs_approval and rejects attempts to forge approval", async () => {
    mocks.request.mockResolvedValue({
      status: "needs_approval",
      approvalRequestId: "TEST-request",
      message: "Nothing sent.",
    });
    const action = {
      kind: "email",
      to: "test@example.invalid",
      subject: "TEST",
      text: "TEST",
    };
    expect(
      await rpc("tools/call", {
        name: "request_customer_action",
        arguments: { action },
      }),
    ).toContain("needs_approval");
    mocks.request.mockClear();
    const invalid = await rpc("tools/call", {
      name: "request_customer_action",
      arguments: { action: { ...action, approved: true } },
    });
    expect(invalid).toMatch(/isError|error/);
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
