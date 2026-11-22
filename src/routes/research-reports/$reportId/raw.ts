import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { isUserAuthMode } from "@/lib/auth-mode";
import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { ReportRepository } from "@/server/features/research-reports/repositories/ReportRepository";
import { asAppError } from "@/server/lib/errors";
import { PROJECT_SCOPE_HEADER } from "@/shared/project-navigation";
import { reportDocumentResponse, textResponse } from "@/shared/report-sandbox";

// The report viewer: the stored document, served byte for byte from the app's
// own origin and locked down by REPORT_CSP. A raw-Response route, so no React
// and no `_authenticated` guard runs — this handler does its own auth.

// One body for "no such report" and "another organization's report", so report
// ids cannot be probed for existence. Archived projects use the same response.
const NOT_FOUND_BODY =
  "This report does not exist or you do not have access to it.";

const reportNotFound = () => textResponse(NOT_FOUND_BODY, 404);

async function handleReportRequest(
  reportId: string,
  request: Request,
): Promise<Response> {
  const projectId = await ReportRepository.getReportProjectId(reportId);
  if (!projectId) return reportNotFound();
  const headers = new Headers(request.headers);
  headers.set(PROJECT_SCOPE_HEADER, projectId);
  let context;
  try {
    context = await resolveUserContextFromHeaders(headers);
  } catch (error) {
    // Only a missing session is answered here, and only where the app has
    // its own sign-in page. A config or session-store failure must not
    // masquerade as "you are logged out", and the delegated self-hosted modes
    // have no sign-in page to complete.
    if (asAppError(error)?.code === "NOT_FOUND") return reportNotFound();
    if (asAppError(error)?.code !== "UNAUTHENTICATED") throw error;
    if (!isUserAuthMode(env.AUTH_MODE)) {
      return textResponse("Sign in to read this report.", 401);
    }
    // The most likely real entry: someone opening a report link in a browser
    // whose session expired.
    const target = `/p/${encodeURIComponent(projectId)}/research-reports/${encodeURIComponent(reportId)}`;
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/sign-in?redirect=${encodeURIComponent(target)}`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  // Reads go through the repository rather than ReportService: the service's
  // job is the save-time caps and refusal copy, and the only policy on a render
  // is the authorization below, which happens here. Authorize before touching
  // the `html` column, so an unauthorized request never pulls a document onto
  // the worker's heap.
  // The canonical project-access check — org ownership plus "not archived" —
  // the same one ensureUserMiddleware uses for server functions. Org ids are
  // never compared by hand.
  const project = await ProjectRepository.getProjectForOrganization(
    projectId,
    context.organizationId,
  );
  if (!project) {
    return reportNotFound();
  }

  const html = await ReportRepository.getReportHtml(projectId, reportId);
  if (html === null) return reportNotFound();

  // Print mode. "Export" in the app opens `/research-reports/<id>/raw?print=1`, and the appended
  // script is the only thing that makes that a one-click path: the tab opens
  // the browser's print dialog itself.
  const print = new URL(request.url).searchParams.get("print") === "1";

  return reportDocumentResponse(html, {
    print,
    cacheControl: "private, no-store",
  });
}

// Handler only, and no `component` on purpose: a component would pull this file
// (and `cloudflare:workers` with it) into the client bundle. That leaves
// this document matchable but componentless in the client route tree. All
// links use plain anchors; sign-in recovery targets the React viewer.
export const Route = createFileRoute("/research-reports/$reportId/raw")({
  server: {
    handlers: {
      GET: ({ params, request }) =>
        handleReportRequest(params.reportId, request),
    },
  },
});

export { handleReportRequest, NOT_FOUND_BODY };
