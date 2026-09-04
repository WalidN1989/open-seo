// Remembers the last project the user was looking at so the app can return them
// there on the next visit. Browser-local only (per-device); the server never
// trusts it — landing and the route guard always re-validate the id against the
// org's project list.
const LAST_PROJECT_KEY = "openseo:lastProjectId";

export function getLastProjectId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

export function setLastProjectId(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_PROJECT_KEY, projectId);
  } catch {
    // Ignore private-mode / disabled-storage failures.
  }
}

export function clearLastProjectId(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LAST_PROJECT_KEY);
  } catch {
    // Ignore private-mode / disabled-storage failures.
  }
}

/**
 * The address segment to put in a link for this project.
 *
 * The slug is what makes /p/booxworm readable; the id is the fallback for a
 * project created before slugs existed. Resolution accepts either, so a link
 * built from the id is still correct — just uglier.
 */
export function projectAddress(project: {
  id: string;
  slug?: string | null;
}): string {
  return project.slug ?? project.id;
}
