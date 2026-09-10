import { runBatch } from "@/db/runBatch";
import { AppError } from "@/server/lib/errors";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { SerpObservationRepository } from "../repositories/SerpObservationRepository";
import { rankCompetitors } from "../rankCompetitors";

/**
 * A project's competitors, from two places that stay one list.
 *
 * **Tracked** are the domains someone chose. They live in project context, the
 * same rows the agent tools read and write, so adding one here is immediately
 * part of what an agent knows about the business — there is no second list to
 * keep in step.
 *
 * **Discovered** are the domains the project's own search results keep
 * showing. They cost nothing: every SERP the app fetches is recorded on the
 * way past, so this is a reading of work already paid for rather than a new
 * purchase.
 */

const MIN_KEYWORDS_TO_SUGGEST = 2;

function normalizeDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

async function overview(projectId: string) {
  const project = await ProjectRepository.getProjectById(projectId);
  const [tracked, observations] = await Promise.all([
    ProjectContextRepository.listCompetitors(projectId),
    SerpObservationRepository.listForProject(projectId),
  ]);

  const trackedDomains = new Set(tracked.map((row) => row.domain));
  const ranked = rankCompetitors(observations, {
    ownDomain: project?.domain ?? null,
    minKeywords: MIN_KEYWORDS_TO_SUGGEST,
    limit: 25,
  });

  // What a domain is worth knowing does not change once it is tracked, so the
  // evidence is attached to both lists rather than only the suggestions.
  const evidence = new Map(ranked.map((item) => [item.domain, item]));

  return {
    tracked: tracked.map((row) => ({
      id: row.id,
      domain: row.domain,
      name: row.name,
      notes: row.notes,
      updatedBy: row.updatedBy,
      seen: evidence.get(row.domain) ?? null,
    })),
    discovered: ranked.filter((item) => !trackedDomains.has(item.domain)),
    keywordsSeen: new Set(observations.map((row) => row.keyword)).size,
  };
}

async function track(
  projectId: string,
  input: { domain: string; name?: string | null; notes?: string | null },
) {
  const domain = normalizeDomain(input.domain);
  if (!domain || !domain.includes(".")) {
    throw new AppError("VALIDATION_ERROR", "That does not look like a domain.");
  }
  const project = await ProjectRepository.getProjectById(projectId);
  if (project?.domain && normalizeDomain(project.domain) === domain) {
    throw new AppError(
      "VALIDATION_ERROR",
      "That is this project's own site, not a competitor.",
    );
  }
  await runBatch((tx) =>
    ProjectContextRepository.upsertCompetitors(
      tx,
      projectId,
      [
        {
          domain,
          name: input.name?.trim() || null,
          notes: input.notes?.trim() || null,
        },
      ],
      "user",
    ),
  );
  return { domain };
}

async function untrack(projectId: string, domain: string) {
  await runBatch((tx) =>
    ProjectContextRepository.deleteCompetitors(tx, projectId, [
      normalizeDomain(domain),
    ]),
  );
}

export const CompetitorService = { overview, track, untrack };
