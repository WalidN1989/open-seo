/**
 * Reading a site address the same way on both sides of the wire.
 *
 * The browser decides whether to offer the Publish button and the server
 * decides what to write; they must agree, so the rule lives in one place.
 */

/** The service a page address points at: /services/<slug>, or null. */
export function serviceSlugFrom(path: string | null) {
  if (!path) return null;
  const withoutQuery = path.split(/[?#]/)[0] ?? "";
  const match = /\/services\/([A-Za-z0-9-]+)\/?$/.exec(withoutQuery);
  return match?.[1]?.toLowerCase() ?? null;
}
