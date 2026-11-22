import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  resolve: vi.fn<(headers: Headers) => Promise<unknown>>(),
  project: vi.fn(),
  projectId: vi.fn(),
  html: vi.fn(),
  shared: vi.fn(),
  enabled: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({ env: { AUTH_MODE: "selfhosted" } }));
vi.mock("@/middleware/ensure-user/resolve", () => ({
  resolveUserContextFromHeaders: mocks.resolve,
}));
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: { getProjectForOrganization: mocks.project },
}));
vi.mock("./repositories/ReportRepository", () => ({
  ReportRepository: {
    getReportProjectId: mocks.projectId,
    getReportHtml: mocks.html,
    getSharedReportByToken: mocks.shared,
  },
}));
vi.mock("./shareAccess", () => ({
  sharesEnabled: mocks.enabled,
  SHARE_TOKEN_PATTERN: /^[A-Za-z0-9_-]{32}$/,
}));
import { handleReportRequest } from "@/routes/research-reports/$reportId/raw";
import { handleSharedReportRequest } from "@/routes/s/$token/raw";
import { handleSharePage } from "@/routes/s/$token/index";
import { AppError } from "@/server/lib/errors";
import { PROJECT_SCOPE_HEADER } from "@/shared/project-navigation";
const token = "a".repeat(32);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.projectId.mockResolvedValue("project-a");
  mocks.resolve.mockResolvedValue({ userId: "user", organizationId: "org-a" });
  mocks.project.mockResolvedValue({ id: "project-a" });
  mocks.html.mockResolvedValue("<html><body>Private evidence</body></html>");
  mocks.enabled.mockResolvedValue(true);
  mocks.shared.mockResolvedValue({
    id: "report-a",
    projectId: "project-a",
    title: "<script>bad</script>",
    archived: false,
  });
});
describe("research report routes", () => {
  it("resolves the owning workspace membership before reading private HTML", async () => {
    const response = await handleReportRequest(
      "report-a",
      new Request("https://app.test/research-reports/report-a/raw", {
        headers: { [PROJECT_SCOPE_HEADER]: "other-tab" },
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.resolve.mock.calls[0]?.[0].get(PROJECT_SCOPE_HEADER)).toBe(
      "project-a",
    );
    expect(mocks.html).toHaveBeenCalledWith("project-a", "report-a");
  });
  it("does not read documents for foreign, archived or deleted projects", async () => {
    mocks.resolve.mockRejectedValue(new AppError("NOT_FOUND"));
    expect(
      (
        await handleReportRequest(
          "report-a",
          new Request("https://app.test/research-reports/report-a/raw"),
        )
      ).status,
    ).toBe(404);
    expect(mocks.html).not.toHaveBeenCalled();
  });

  it("requires the exact owning project identity when an address resolves as a slug", async () => {
    mocks.project.mockResolvedValue({ id: "different-project" });
    const response = await handleReportRequest(
      "report-a",
      new Request("https://app.test/research-reports/report-a/raw"),
    );
    expect(response.status).toBe(404);
    expect(mocks.html).not.toHaveBeenCalled();
  });
  it("redirects an expired account session without reading HTML", async () => {
    mocks.resolve.mockRejectedValue(new AppError("UNAUTHENTICATED"));
    const response = await handleReportRequest(
      "report-a",
      new Request("https://app.test/research-reports/report-a/raw"),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "/sign-in?redirect=%2Fp%2Fproject-a%2Fresearch-reports%2Freport-a",
    );
    expect(mocks.html).not.toHaveBeenCalled();
  });
  it("does not render sign-in inside an opaque report iframe", async () => {
    mocks.resolve.mockRejectedValue(new AppError("UNAUTHENTICATED"));
    const response = await handleReportRequest(
      "report-a",
      new Request("https://app.test/research-reports/report-a/raw", {
        headers: { "Sec-Fetch-Dest": "iframe" },
      }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.has("Location")).toBe(false);
    expect(await response.text()).toContain("Reload Digital Urgency");
    expect(mocks.html).not.toHaveBeenCalled();
  });
  it("does not disguise auth infrastructure failures as a signed-out session", async () => {
    mocks.resolve.mockRejectedValue(new Error("session-store unavailable"));
    await expect(
      handleReportRequest(
        "report-a",
        new Request("https://app.test/research-reports/report-a/raw"),
      ),
    ).rejects.toThrow("session-store unavailable");
  });
  it("rejects malformed and disabled shares before database lookups", async () => {
    expect((await handleSharePage("bad")).status).toBe(404);
    mocks.enabled.mockResolvedValue(false);
    expect(
      (
        await handleSharedReportRequest(
          token,
          new Request(`https://app.test/s/${token}/raw`),
        )
      ).status,
    ).toBe(404);
    expect(mocks.shared).not.toHaveBeenCalled();
    expect(mocks.html).not.toHaveBeenCalled();
  });
  it("revoked and archived shares use the same response and never read HTML", async () => {
    mocks.shared
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ archived: true });
    const request = new Request(`https://app.test/s/${token}/raw`);
    const revoked = await handleSharedReportRequest(token, request);
    const archived = await handleSharedReportRequest(token, request);
    expect(revoked.status).toBe(404);
    expect(await revoked.text()).toBe(await archived.text());
    expect(mocks.html).not.toHaveBeenCalled();
  });
  it("escapes shared metadata and keeps both responses uncached and noindexed", async () => {
    const wrapper = await handleSharePage(token);
    const html = await wrapper.text();
    expect(html).toContain("&lt;script&gt;bad&lt;/script&gt;");
    expect(html).not.toContain("<script>bad</script>");
    expect(html).toContain(
      'sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"',
    );
    const raw = await handleSharedReportRequest(
      token,
      new Request(`https://app.test/s/${token}/raw`),
    );
    for (const response of [wrapper, raw]) {
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    }
  });
  it("redirects top-level raw reads to the branded wrapper", async () => {
    const response = await handleSharedReportRequest(
      token,
      new Request(`https://app.test/s/${token}/raw`, {
        headers: { "Sec-Fetch-Dest": "document" },
      }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`/s/${token}`);
    expect(mocks.html).not.toHaveBeenCalled();
  });
});
