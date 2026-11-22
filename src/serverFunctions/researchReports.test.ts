import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import {
  listReports,
  getReport,
  shareReport,
  unshareReport,
  deleteReport,
} from "./researchReports";
import {
  listReportTemplates,
  saveReportTemplate,
  deleteReportTemplate,
} from "./reportTemplates";
const mocks = vi.hoisted(() => ({
  listReports: vi.fn(),
  getReport: vi.fn(),
  shareReport: vi.fn(),
  unshareReport: vi.fn(),
  deleteReport: vi.fn(),
  listReportTemplates: vi.fn(),
  saveReportTemplate: vi.fn(),
  deleteReportTemplate: vi.fn(),
  getCreatorNames: vi.fn(),
}));
vi.mock("@/server/features/research-reports/services/ReportService", () => ({
  ReportService: mocks,
}));
vi.mock(
  "@/server/features/research-reports/services/ReportTemplateService",
  () => ({ ReportTemplateService: mocks }),
);
vi.mock(
  "@/server/features/research-reports/repositories/ReportRepository",
  () => ({ ReportRepository: mocks }),
);
vi.mock("@/serverFunctions/middleware", () => ({ requireProjectContext: [] }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      validator: (schema: z.ZodType) => ({
        handler:
          (
            handler: (args: {
              data: unknown;
              context: {
                projectId: string;
                organizationId: string;
                userId: string;
              };
            }) => unknown,
          ) =>
          ({ data }: { data: unknown }) =>
            handler({
              data: schema.parse(data),
              context: {
                projectId: "authorized-project",
                organizationId: "authorized-org",
                userId: "authenticated-user",
              },
            }),
      }),
    }),
  }),
}));
beforeEach(() => {
  mocks.listReports.mockResolvedValue({ reports: [] });
  mocks.getReport.mockResolvedValue({
    id: "report",
    createdByUserId: "writer",
  });
  mocks.getCreatorNames.mockResolvedValue([]);
  mocks.listReportTemplates.mockResolvedValue({ templates: [] });
  mocks.shareReport.mockResolvedValue({
    shareToken: "a".repeat(32),
    sharedAt: "2026-11-22",
  });
  mocks.unshareReport.mockResolvedValue({ shareToken: null, sharedAt: null });
  mocks.saveReportTemplate.mockResolvedValue({
    templateId: "template",
    created: true,
  });
});
describe("saved research report server function context", () => {
  const data = { projectId: "foreign-project", reportId: "report" };
  it("takes report read/delete scope from authorized middleware instead of posted project ids", async () => {
    await listReports({ data });
    await getReport({ data });
    await deleteReport({ data });
    expect(mocks.listReports).toHaveBeenCalledWith({
      projectId: "authorized-project",
      limit: 20,
      offset: 0,
    });
    expect(mocks.getReport).toHaveBeenCalledWith(
      "authorized-project",
      "report",
    );
    expect(mocks.deleteReport).toHaveBeenCalledWith(
      "authorized-project",
      "report",
    );
  });
  it("stamps sharing identity and organization from the authenticated context", async () => {
    await shareReport({ data });
    await unshareReport({ data });
    const expected = {
      projectId: "authorized-project",
      reportId: "report",
      userId: "authenticated-user",
      organizationId: "authorized-org",
    };
    expect(mocks.shareReport).toHaveBeenCalledWith(expected);
    expect(mocks.unshareReport).toHaveBeenCalledWith(expected);
  });
  it("scopes template mutations and stamps creation identity from middleware", async () => {
    await listReportTemplates({ data });
    await saveReportTemplate({
      data: {
        projectId: "foreign-project",
        name: "Monthly review",
        description: "For owners",
        instructions: "Evidence and action",
      },
    });
    await deleteReportTemplate({
      data: { projectId: "foreign-project", templateId: "template" },
    });
    expect(mocks.listReportTemplates).toHaveBeenCalledWith(
      "authorized-project",
    );
    expect(mocks.saveReportTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "authorized-project",
        createdByUserId: "authenticated-user",
      }),
    );
    expect(mocks.deleteReportTemplate).toHaveBeenCalledWith(
      "authorized-project",
      "template",
    );
  });
});
