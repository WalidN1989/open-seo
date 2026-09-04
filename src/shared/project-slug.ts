/**
 * The readable part of a project's address: /p/booxworm rather than
 * /p/fe7b986f-5a61-4eb1-ae08-280380c280d9.
 *
 * A slug is generated once, when the project is created, and then left alone.
 * Regenerating it on rename would break the address the person is standing on
 * at the moment they rename, which is worse than an address that no longer
 * matches the name.
 */

/** Long enough to stay readable, short enough not to dominate the address. */
const MAX_SLUG_LENGTH = 48;

export function toProjectSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    // Strip accents so "Café" becomes "cafe" rather than losing the letter.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, "");

  return slug || "project";
}

/**
 * The next free slug given the ones already taken.
 *
 * Slugs are unique across the deployment because the address has to resolve to
 * exactly one project without knowing whose it is. Two agencies can both have
 * a client called Acme, so the second one becomes acme-2.
 */
export function nextAvailableProjectSlug(
  name: string,
  taken: Iterable<string>,
): string {
  const base = toProjectSlug(name);
  const used = new Set(taken);
  if (!used.has(base)) return base;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }

  // A thousand collisions means something is generating names in a loop;
  // fall back to something unique rather than returning a duplicate.
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}
