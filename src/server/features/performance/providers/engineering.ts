import { z } from "zod";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { getSelfHostSetupStatus } from "@/server/lib/setup-status";
import type {
  EngineeringSignal,
  PerformanceStatus,
} from "@/shared/performance";

const runSchema = z.object({
  id: z.number(),
  workflow_id: z.number(),
  name: z.string().nullable(),
  status: z.string(),
  conclusion: z.string().nullable(),
  updated_at: z.string(),
});
const pullSchema = z.object({
  number: z.number(),
  title: z.string(),
  updated_at: z.string(),
});
const railwaySchema = z.object({
  data: z.object({
    serviceInstance: z.object({
      latestDeployment: z
        .object({ id: z.string(), status: z.string(), createdAt: z.string() })
        .nullable(),
    }),
  }),
});

async function request(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("Monitoring request failed");
  return response.json();
}

export async function engineeringSignals(): Promise<EngineeringSignal[]> {
  const observedAt = new Date().toISOString();
  const signal = (
    system: string,
    status: PerformanceStatus,
    evidence: string,
    extra: Partial<EngineeringSignal> = {},
  ): EngineeringSignal => ({
    id: system,
    system,
    status,
    evidence,
    observedAt,
    eventAt: null,
    url: null,
    ...extra,
  });
  const github = async (): Promise<EngineeringSignal[]> => {
    const [repo, token] = await Promise.all([
      getOptionalEnvValue("PERFORMANCE_GITHUB_REPOSITORY"),
      getOptionalEnvValue("PERFORMANCE_GITHUB_TOKEN"),
    ]);
    if (!repo || !token)
      return [
        signal(
          "GitHub",
          "not_configured",
          "Set the Performance repository and read-only GitHub token in Railway.",
        ),
      ];
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo))
      return [
        signal(
          "GitHub",
          "unable_to_check",
          "Repository configuration is invalid.",
        ),
      ];
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    const base = `https://github.com/${repo}`;
    const [runs, pulls] = await Promise.allSettled([
      request(
        `https://api.github.com/repos/${repo}/actions/runs?branch=main&per_page=100`,
        { headers },
      ).then(
        (r) =>
          z.object({ workflow_runs: z.array(runSchema) }).parse(r)
            .workflow_runs,
      ),
      request(
        `https://api.github.com/repos/${repo}/pulls?state=open&per_page=30`,
        { headers },
      ).then((r) => z.array(pullSchema).parse(r)),
    ]);
    const signals: EngineeringSignal[] = [];
    if (runs.status === "rejected")
      signals.push(
        signal(
          "GitHub checks",
          "unable_to_check",
          "Could not read workflow runs. Check the read-only token permissions.",
        ),
      );
    else {
      const latest = new Map<number, z.infer<typeof runSchema>>();
      for (const run of runs.value)
        if (!latest.has(run.workflow_id)) latest.set(run.workflow_id, run);
      if (!latest.size)
        signals.push(
          signal(
            "GitHub checks",
            "stale",
            "No main-branch workflow runs were returned.",
            { url: `${base}/actions` },
          ),
        );
      for (const run of latest.values()) {
        const failed = [
          "failure",
          "timed_out",
          "action_required",
          "startup_failure",
        ].includes(run.conclusion ?? "");
        const old =
          !Number.isFinite(Date.parse(run.updated_at)) ||
          Date.now() - Date.parse(run.updated_at) > 7 * 86_400_000;
        const status = failed
          ? "attention"
          : old
            ? "stale"
            : run.conclusion === "success"
              ? "healthy"
              : "attention";
        signals.push(
          signal(
            "GitHub checks",
            status,
            `${run.name ?? "Workflow"}: ${run.conclusion ?? run.status}. Latest returned run for this workflow (up to 100 main runs scanned).`,
            {
              id: `github:${run.id}`,
              eventAt: run.updated_at,
              url: `${base}/actions/runs/${run.id}`,
            },
          ),
        );
      }
    }
    if (pulls.status === "rejected")
      signals.push(
        signal(
          "GitHub pull requests",
          "unable_to_check",
          "Could not read open pull requests.",
        ),
      );
    else if (!pulls.value.length)
      signals.push(
        signal(
          "GitHub pull requests",
          "healthy",
          "No open pull requests at this check.",
          { url: `${base}/pulls` },
        ),
      );
    else
      for (const pr of pulls.value)
        signals.push(
          signal(
            "GitHub pull requests",
            "attention",
            `#${pr.number} ${pr.title} (showing up to 30 open requests).`,
            {
              id: `pr:${pr.number}`,
              eventAt: pr.updated_at,
              url: `${base}/pull/${pr.number}`,
            },
          ),
        );
    return signals;
  };
  const railway = async (): Promise<EngineeringSignal[]> => {
    const [token, project, environment, service] = await Promise.all(
      ["TOKEN", "PROJECT_ID", "ENVIRONMENT_ID", "SERVICE_ID"].map((suffix) =>
        getOptionalEnvValue(`PERFORMANCE_RAILWAY_${suffix}`),
      ),
    );
    if (!token || !project || !environment || !service)
      return [
        signal(
          "Railway",
          "not_configured",
          "Set a scoped Railway project token and project, environment, service IDs.",
        ),
      ];
    const data = railwaySchema.parse(
      await request("https://backboard.railway.com/graphql/v2", {
        method: "POST",
        headers: {
          "Project-Access-Token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query:
            "query($serviceId:String!,$environmentId:String!){serviceInstance(serviceId:$serviceId,environmentId:$environmentId){latestDeployment{id status createdAt}}}",
          variables: { serviceId: service, environmentId: environment },
        }),
      }),
    );
    const deployment = data.data.serviceInstance.latestDeployment;
    if (!deployment)
      return [signal("Railway", "stale", "No deployment was returned.")];
    return [
      signal(
        "Railway",
        deployment.status === "SUCCESS" ? "healthy" : "attention",
        `Latest deployment: ${deployment.status}. This is deployment state, not continuous uptime monitoring.`,
        {
          eventAt: deployment.createdAt,
          url: `https://railway.com/project/${encodeURIComponent(project)}/service/${encodeURIComponent(service)}?environmentId=${encodeURIComponent(environment)}`,
          id: `railway:${deployment.id}`,
        },
      ),
    ];
  };
  const errors = async (): Promise<EngineeringSignal[]> => {
    const [key, project, region] = await Promise.all([
      getOptionalEnvValue("PERFORMANCE_POSTHOG_TOKEN"),
      getOptionalEnvValue("PERFORMANCE_POSTHOG_PROJECT_ID"),
      getOptionalEnvValue("PERFORMANCE_POSTHOG_REGION"),
    ]);
    if (!key || !project || !region)
      return [
        signal(
          "Production errors",
          "not_configured",
          "Set PostHog read credentials and region for a production-only project.",
        ),
      ];
    if (!/^\d+$/.test(project) || !["us", "eu"].includes(region))
      return [
        signal(
          "Production errors",
          "unable_to_check",
          "PostHog configuration is invalid.",
        ),
      ];
    const host = `https://${region}.posthog.com`;
    const raw = await request(`${host}/api/projects/${project}/query/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query:
            "SELECT count() FROM events WHERE event = '$exception' AND timestamp > now() - INTERVAL 24 HOUR",
        },
      }),
    });
    const parsed = z
      .object({ results: z.array(z.tuple([z.number().nonnegative()])).min(1) })
      .parse(raw);
    const count = parsed.results[0]?.[0] ?? 0;
    return [
      signal(
        "Production errors",
        count ? "attention" : "stale",
        `${count} captured exceptions in 24 hours. Capture coverage is not verified; absence of events does not prove the application is error-free.`,
        { url: `${host}/project/${project}/error_tracking` },
      ),
    ];
  };
  const health = async (): Promise<EngineeringSignal[]> => {
    const setup = await getSelfHostSetupStatus();
    const issues = Object.entries(setup.checks)
      .filter(([, check]) => check.status !== "ok")
      .map(([name]) => name);
    return [
      signal(
        "Application health",
        issues.length ? "attention" : "healthy",
        issues.length
          ? `Setup checks need attention: ${issues.join(", ")}`
          : "Database responded and configured setup checks passed at this check. External service uptime is not covered.",
      ),
    ];
  };
  const sources = [
    { name: "GitHub", run: github },
    { name: "Railway", run: railway },
    { name: "Production errors", run: errors },
    { name: "Application health", run: health },
  ];
  return (
    await Promise.all(
      sources.map(async (source) => {
        try {
          return await source.run();
        } catch {
          return [
            signal(
              source.name,
              "unable_to_check",
              "The monitoring source could not be checked. No healthy status is assumed.",
            ),
          ];
        }
      }),
    )
  ).flat();
}
