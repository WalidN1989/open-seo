import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type * as ReportRepositoryModule from "./ReportRepository";
import type * as ReportServiceModule from "../services/ReportService";

const mocks = vi.hoisted(() => ({ captureServerEvent: vi.fn() }));
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: async () => true,
  getOptionalEnvValue: async () => "selfhosted",
}));
vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: mocks.captureServerEvent,
}));

let client: Client;
let ReportRepository: typeof ReportRepositoryModule.ReportRepository;
let ReportService: typeof ReportServiceModule.ReportService;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  // Load the real repository and service after installing the runtime database.
  vi.doMock("@/db", () => ({ db: testDb }));
  await client.executeMultiple(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL
    );
    INSERT INTO projects VALUES ('project_1', 'org_1'), ('project_2', 'org_2');
    CREATE TABLE research_reports (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      html TEXT NOT NULL,
      skill TEXT,
      template_id TEXT,
      created_by TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      share_token TEXT UNIQUE,
      shared_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(project_id, title)
    );
  `);
  ({ ReportRepository } = await import("./ReportRepository"));
  ({ ReportService } = await import("../services/ReportService"));
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  await client.execute("DELETE FROM research_reports");
  await ReportRepository.insertReport({
    id: "report_1",
    projectId: "project_1",
    title: "SEO audit",
    summary: "One clear verdict.",
    html: "<html><body>Report</body></html>",
    skill: "seo-audit",
    templateId: null,
    createdBy: "Codex",
    createdByUserId: "user_1",
    sizeBytes: 32,
  });
});

describe("report sharing persistence", () => {
  it("returns the same persisted link when two publishers both read a private report", async () => {
    const getReport = ReportRepository.getReport;
    let releaseReads!: () => void;
    const bothRead = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    let initialReads = 0;
    vi.spyOn(ReportRepository, "getReport").mockImplementation(
      async (projectId, reportId) => {
        const report = await getReport(projectId, reportId);
        if (initialReads < 2) {
          expect(report?.shareToken).toBeNull();
          initialReads += 1;
          if (initialReads === 2) releaseReads();
          await bothRead;
        }
        return report;
      },
    );
    const params = {
      projectId: "project_1",
      reportId: "report_1",
      userId: "user_1",
      organizationId: "org_1",
      source: "mcp" as const,
    };

    const published = await Promise.all([
      ReportService.shareReport(params),
      ReportService.shareReport(params),
    ]);
    const stored = await getReport(params.projectId, params.reportId);

    expect(initialReads).toBe(2);
    expect(stored?.shareToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    for (const report of published) {
      expect(report.shareToken).toBe(stored?.shareToken);
      expect(report.sharedAt).toBe(stored?.sharedAt);
    }
    expect(mocks.captureServerEvent).toHaveBeenCalledTimes(1);
    expect(mocks.captureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "report:shared" }),
    );
  });

  it("preserves the winning token until revocation permits a new one", async () => {
    const first = {
      shareToken: "a".repeat(32),
      sharedAt: "2026-09-20T10:00:00.000Z",
    };
    const second = {
      shareToken: "b".repeat(32),
      sharedAt: "2026-09-20T11:00:00.000Z",
    };

    await expect(
      ReportRepository.setShareToken("project_1", "report_1", first),
    ).resolves.toBe(true);
    await expect(
      ReportRepository.setShareToken("project_1", "report_1", second),
    ).resolves.toBe(false);
    await expect(
      ReportRepository.getReport("project_1", "report_1"),
    ).resolves.toMatchObject(first);

    await expect(
      ReportRepository.setShareToken("project_1", "report_1", null),
    ).resolves.toBe(true);
    await expect(
      ReportRepository.getReport("project_1", "report_1"),
    ).resolves.toMatchObject({ shareToken: null, sharedAt: null });
    await expect(
      ReportRepository.setShareToken("project_1", "report_1", second),
    ).resolves.toBe(true);
    await expect(
      ReportRepository.getReport("project_1", "report_1"),
    ).resolves.toMatchObject(second);
  });

  it.each([
    ["foreign_project", "report_1"],
    ["project_1", "missing_report"],
  ])("refuses sharing mutations for %s / %s", async (projectId, reportId) => {
    const share = {
      shareToken: "a".repeat(32),
      sharedAt: "2026-09-20T10:00:00.000Z",
    };
    await expect(
      ReportRepository.setShareToken(projectId, reportId, share),
    ).resolves.toBe(false);
    await expect(
      ReportRepository.getReport("project_1", "report_1"),
    ).resolves.toMatchObject({ shareToken: null, sharedAt: null });

    await ReportRepository.setShareToken("project_1", "report_1", share);
    await expect(
      ReportRepository.setShareToken(projectId, reportId, null),
    ).resolves.toBe(false);
    await expect(
      ReportRepository.getReport("project_1", "report_1"),
    ).resolves.toMatchObject(share);
  });
});

describe("report content isolation", () => {
  it("does not read, overwrite, or delete another project's report", async () => {
    expect(
      await ReportRepository.getReport("project_2", "report_1"),
    ).toBeNull();
    expect(
      await ReportRepository.getReportHtml("project_2", "report_1"),
    ).toBeNull();
    expect(
      await ReportRepository.getReportWithHtml("project_2", "report_1"),
    ).toBeNull();
    await ReportRepository.updateReportContent({
      projectId: "project_2",
      reportId: "report_1",
      title: "Foreign overwrite",
      summary: "No",
      html: "<html></html>",
      skill: null,
      templateId: null,
      sizeBytes: 13,
    });
    expect(await ReportRepository.deleteReport("project_2", "report_1")).toBe(
      false,
    );
    expect(
      await ReportRepository.getReport("project_1", "report_1"),
    ).toMatchObject({ title: "SEO audit", createdByUserId: "user_1" });
  });
  it("enforces unique titles within a project at storage, while another project may reuse a title", async () => {
    const existing = await ReportRepository.getReportWithHtml(
      "project_1",
      "report_1",
    );
    if (!existing) throw new Error("Missing fixture");
    const {
      id: _id,
      updatedAt: _updatedAt,
      createdAt: _createdAt,
      sharedAt: _sharedAt,
      shareToken: _shareToken,
      ...content
    } = existing;
    await expect(
      ReportRepository.insertReport({ ...content, id: "duplicate" }),
    ).rejects.toThrow();
    await expect(
      ReportRepository.insertReport({
        ...content,
        projectId: "project_2",
        id: "separate-project",
      }),
    ).resolves.toBeUndefined();
  });
});
