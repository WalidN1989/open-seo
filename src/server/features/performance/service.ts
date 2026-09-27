import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { AppError } from "@/server/lib/errors";
import type {
  PerformanceAnswer,
  PerformanceFilter,
  PerformanceOverview,
  PerformanceRecord,
} from "@/shared/performance";
import { collectOperations } from "./operations";
import { hasClientLogin } from "./repositories/access";
import { engineeringSignals } from "./providers/engineering";
import { prioritize, routeQuestion } from "./providers/jev";
import { claimJevRequest } from "./request-budget";

type Identity = { userId: string; userEmail: string; emailVerified: boolean };
const newest = (a: PerformanceRecord, b: PerformanceRecord) =>
  (Date.parse(b.timestamp ?? "") || 0) - (Date.parse(a.timestamp ?? "") || 0);

async function isOperator(identity: Identity) {
  const emails =
    (await getOptionalEnvValue("PERFORMANCE_OPERATOR_EMAILS"))
      ?.split(",")
      .map((e) => e.trim().toLowerCase()) ?? [];
  return (
    identity.emailVerified &&
    emails.includes(identity.userEmail.toLowerCase()) &&
    !(await hasClientLogin(identity.userId))
  );
}

export async function getOverview(
  identity: Identity,
  filter: PerformanceFilter,
): Promise<PerformanceOverview> {
  const projects = (
    await ProjectRepository.listProjectsForMember(identity.userId)
  ).map(({ id, name, organizationId }) => ({ id, name, organizationId }));
  if (filter.projectId && !projects.some((p) => p.id === filter.projectId))
    throw new AppError("FORBIDDEN");
  const selected = filter.projectId
    ? projects.filter((p) => p.id === filter.projectId)
    : projects;
  // Business rows belong to organizations. Multiple projects must not multiply counts.
  const organizations = new Map(selected.map((p) => [p.organizationId, p]));
  const now = new Date();
  const result: PerformanceOverview = {
    observedAt: now.toISOString(),
    projects,
    selectedProjectId: filter.projectId ?? null,
    activeProjectCount: selected.length,
    organizationCount: organizations.size,
    metrics: [],
    attention: [],
    activity: [],
    connections: [],
    unavailable: [],
    latestEmail: null,
    engineering: null,
    jev: {
      status: "not_configured",
      detail:
        "Set TYPESAFE_API_KEY in Railway to enable quick questions and suggested priorities.",
    },
  };
  // Sequential organizations keep database concurrency bounded; each summary uses
  // aggregate counts plus small projections, never full messages or credentials.
  for (const project of organizations.values()) {
    try {
      const access = await BusinessModuleService.getAccess(
        project.organizationId,
        identity.userId,
      );
      const modules = new Set(
        access.filter((m) => m.enabled && m.permission).map((m) => m.key),
      );
      const data = await collectOperations(project, modules, now);
      for (const metric of data.metrics) {
        const existing = result.metrics.find((m) => m.key === metric.key);
        if (existing) {
          existing.count += metric.count;
          existing.organizations++;
        } else result.metrics.push(metric);
      }
      result.attention.push(...data.attention);
      result.activity.push(...data.activity);
      result.connections.push(...data.connections);
      result.unavailable.push(...data.unavailable);
      if (
        data.latestEmail &&
        (!result.latestEmail ||
          newest(data.latestEmail, result.latestEmail) < 0)
      )
        result.latestEmail = data.latestEmail;
    } catch {
      result.unavailable.push(
        `${project.name}: access or records could not be checked.`,
      );
    }
  }
  result.attention = result.attention.toSorted(newest).slice(0, 60);
  result.activity = result.activity.toSorted(newest).slice(0, 60);
  if (await isOperator(identity))
    result.engineering = await engineeringSignals();
  if (await getOptionalEnvValue("TYPESAFE_API_KEY"))
    result.jev = {
      status: "configured",
      detail:
        "Jev routes quick questions and suggests priorities on request. Facts come from recorded data. No automatic model calls.",
    };
  return result;
}

export async function askPerformance(
  identity: Identity,
  data: PerformanceFilter & { question: string },
): Promise<PerformanceAnswer> {
  // Authorize the requested scope before making a paid model request.
  const overview = await getOverview(identity, data);
  claimJevRequest(identity.userId);
  const route = await routeQuestion(data.question);
  const answer: PerformanceAnswer = {
    text: "",
    observedAt: overview.observedAt,
    sources: [],
    signals: [],
    jevStatus: route.status,
  };
  if (!route.intent) {
    answer.text =
      route.status === "not_configured"
        ? "Jev is not configured. The Performance dashboard remains available."
        : route.status === "uncertain"
          ? "Please ask one question about project count, WhatsApp connections, the latest email, items needing attention, or engineering checks."
          : "Jev could not be checked. Please use the dashboard or try again later; no other model was called.";
    return answer;
  }
  const qualifier = overview.unavailable.length
    ? " Some authorized sources could not be checked; this answer may be incomplete."
    : "";
  switch (route.intent) {
    case "projects":
      answer.text = `${overview.activeProjectCount} active projects in this scope, across ${overview.organizationCount} workspaces.`;
      break;
    case "whatsapp": {
      const connections = overview.connections.filter(
        (c) => c.kind === "whatsapp" && c.status === "connected" && !c.failed,
      );
      const organizationIds = new Set(
        connections.flatMap(
          (c) =>
            overview.projects.find((p) => p.id === c.projectId)
              ?.organizationId ?? [],
        ),
      );
      const names = overview.projects
        .filter(
          (p) =>
            organizationIds.has(p.organizationId) &&
            (!data.projectId || p.id === data.projectId),
        )
        .map((p) => p.name);
      answer.text = names.length
        ? `Recorded connected WhatsApp accounts belong to: ${names.join(", ")}. This is stored connection state, not a live delivery test.`
        : "No connected WhatsApp accounts were found in the authorized sources checked.";
      answer.sources = connections;
      break;
    }
    case "latest_email":
      answer.text = overview.latestEmail
        ? `Latest recorded incoming email: ${overview.latestEmail.title} · ${overview.latestEmail.projectName}.`
        : "No incoming email was found in the authorized sources checked.";
      answer.sources = overview.latestEmail ? [overview.latestEmail] : [];
      break;
    case "attention":
      answer.text = overview.attention.length
        ? "These recorded items need review. The list is a bounded sample; dashboard metric counts cover all matching records."
        : "No attention items were found in the authorized sources checked.";
      answer.sources = overview.attention.slice(0, 10);
      break;
    case "engineering":
      answer.text = overview.engineering
        ? "Current engineering evidence is shown below. Missing or stale monitoring does not mean healthy."
        : "Engineering monitoring is restricted to configured platform operators.";
      answer.signals = overview.engineering ?? [];
      break;
  }
  answer.text += qualifier;
  return answer;
}

export async function suggestPriorities(
  identity: Identity,
  filter: PerformanceFilter,
) {
  const overview = await getOverview(identity, filter);
  claimJevRequest(identity.userId);
  return prioritize(overview.attention, Date.now());
}
