/**
 * Duplicate detection for project creation.
 *
 * Comparison happens here rather than in SQL on purpose: Postgres `LIKE` and
 * `=` are case-sensitive where SQLite's are not, so a query that passes in
 * tests can let a duplicate through in production. Organizations hold a
 * handful of projects, so comparing in memory costs nothing and behaves the
 * same on both backends.
 */

export type ProjectIdentity = {
  id: string;
  name: string;
  domain: string | null;
  archivedAt: string | null;
};

/** Case and spacing are presentation, not identity. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Domains ignore case, a leading www., and a trailing slash. */
export function normalizeDomainForCompare(domain: string | null): string {
  if (!domain) return "";
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

/**
 * The existing project a new one would duplicate, if any.
 *
 * An archived project still counts: it can be restored, and letting a second
 * project take its name and domain would leave two claims on the same site.
 * Only a permanent delete frees the pair.
 */
export function findDuplicateProject(
  existing: readonly ProjectIdentity[],
  candidate: { name: string; domain: string | null },
): ProjectIdentity | null {
  const name = normalizeName(candidate.name);
  const domain = normalizeDomainForCompare(candidate.domain);
  if (!name) return null;
  return (
    existing.find(
      (project) =>
        normalizeName(project.name) === name &&
        normalizeDomainForCompare(project.domain) === domain,
    ) ?? null
  );
}

export function duplicateProjectMessage(existing: ProjectIdentity): string {
  return existing.archivedAt
    ? `An archived project already uses that name and website. Restore "${existing.name}" instead of creating a second one.`
    : `A project called "${existing.name}" already uses that website.`;
}
