import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { z } from "zod";
import { createMcpHandler } from "agents/mcp/server";
import {
  createTenancyFixture,
  PROJECT_A1,
  PROJECT_B1,
  USER_OWNER_A,
  ORG_A,
} from "@/test/tenancy/fixture";
import type { createOpenSeoMcpServer } from "@/server/mcp/server";
import { createWorkersOAuthMcpProps } from "@/server/mcp/context";
vi.mock("cloudflare:workers", () => ({ env: { AUTH_MODE: "selfhosted" } }));
vi.mock("@/server/lib/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/server/features/research-reports/shareAccess", () => ({
  sharesEnabled: async () => true,
}));
vi.mock("@/server/mcp/catalogue", async () => {
  const reports = await import("./research-report-tools");
  const templates = await import("./report-template-tools");
  const sharing = await import("./research-report-sharing-tools");
  return {
    ALL_MCP_TOOLS: [
      reports.saveReportTool,
      reports.listReportsTool,
      reports.getReportTool,
      templates.listReportTemplatesTool,
      templates.saveReportTemplateTool,
      sharing.setReportSharingTool,
    ],
  };
});
vi.mock("@/server/mcp/instrumentation", () => ({
  instrumentMcpToolHandler: (
    _name: string,
    _schema: unknown,
    handler: unknown,
  ) => handler,
}));
let fixture: Awaited<ReturnType<typeof createTenancyFixture>>;
let createServer: typeof createOpenSeoMcpServer;
beforeAll(async () => {
  fixture = await createTenancyFixture();
  vi.doMock("@/db", () => ({ db: fixture.db }));
  ({ createOpenSeoMcpServer: createServer } =
    await import("@/server/mcp/server"));
});
afterAll(() => fixture?.client.close());
async function rpc(method: string, params?: unknown) {
  const props = createWorkersOAuthMcpProps({
    userId: USER_OWNER_A,
    userEmail: "test@example.invalid",
    organizationId: ORG_A,
    baseUrl: "https://example.invalid",
  });
  const handler = createMcpHandler(() => createServer(props), {
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
function structured(text: string) {
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  return z
    .object({ result: z.object({ structuredContent: z.looseObject({}) }) })
    .parse(JSON.parse(line ? line.slice(6) : text)).result.structuredContent;
}
it("persists reports across independent MCP requests and withholds foreign projects and agent deletion", async () => {
  const tools = await rpc("tools/list");
  expect(tools).toContain('"name":"save_report"');
  expect(tools).not.toContain('"name":"delete_report"');
  const html =
    "<!doctype html><html><head><title>Test</title></head><body><h1>Saved evidence</h1><p>Synthetic evidence and a clear recommendation for the local protocol test.</p></body></html>";
  const saved = structured(
    await rpc("tools/call", {
      name: "save_report",
      arguments: {
        projectId: PROJECT_A1,
        title: "Protocol backlink report",
        summary:
          "Verdict: review the saved candidates before buying another dataset.",
        html,
        skill: "link-prospecting",
      },
    }),
  );
  const id = z.string().parse(saved.reportId);
  expect(
    await rpc("tools/call", {
      name: "list_reports",
      arguments: { projectId: PROJECT_A1 },
    }),
  ).toContain("Protocol backlink report");
  const read = await rpc("tools/call", {
    name: "get_report",
    arguments: { projectId: PROJECT_A1, reportId: id, includeHtml: true },
  });
  expect(read).toContain("Saved evidence");
  expect(read).toContain("review the saved candidates");
  const foreign = await rpc("tools/call", {
    name: "get_report",
    arguments: { projectId: PROJECT_B1, reportId: id, includeHtml: true },
  });
  expect(foreign).not.toContain("Saved evidence");
  expect(foreign).toMatch(/error|isError/);
  const incomplete = await rpc("tools/call", {
    name: "save_report",
    arguments: {
      projectId: PROJECT_A1,
      title: "Incomplete document",
      summary: "A partial response must never overwrite a good report.",
      html: "<html><body>partial",
    },
  });
  expect(incomplete).toMatch(/error|isError/);
});

it("keeps canonical project scope when an owned slug is another project's ID", async () => {
  const address = "9a73036c-144e-4be1-b970-7166c0bb2244";
  await fixture.client.execute({
    sql: "INSERT INTO projects(id,organization_id,name,slug) VALUES (?,?,?,?),(?,?,?,?)",
    args: [
      address,
      "org_beta",
      "Other workspace",
      "other-workspace",
      "canonical-owned-project",
      "org_alpha",
      "Owned project",
      address,
    ],
  });
  const saved = structured(
    await rpc("tools/call", {
      name: "save_report",
      arguments: {
        projectId: address,
        title: "Canonical scope report",
        summary: "Local tenancy regression.",
        html: "<html><body>Local scope evidence</body></html>",
      },
    }),
  );
  const id = z.string().parse(saved.reportId);
  expect(
    (
      await fixture.client.execute({
        sql: "SELECT project_id FROM research_reports WHERE id=?",
        args: [id],
      })
    ).rows,
  ).toEqual([{ project_id: "canonical-owned-project" }]);
  expect(saved.url).toContain("/p/canonical-owned-project/research-reports/");
  await fixture.client.execute({
    sql: "INSERT INTO research_reports(id,project_id,title,summary,html,created_by,created_by_user_id,size_bytes) VALUES (?,?,?,?,?,?,?,?)",
    args: [
      "foreign-report",
      address,
      "Private foreign report",
      "Private foreign summary",
      "<html>Private foreign evidence</html>",
      "Test",
      "test-owner",
      37,
    ],
  });
  const foreign = await rpc("tools/call", {
    name: "get_report",
    arguments: {
      projectId: address,
      reportId: "foreign-report",
      includeHtml: true,
    },
  });
  expect(foreign).not.toContain("Private foreign evidence");
  expect(foreign).toMatch(/error|isError/);
});
