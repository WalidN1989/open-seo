/**
 * A small hold for things the voice agent reads on every spoken turn.
 *
 * Speech is answered in seconds, and the workspace facts behind an answer —
 * which projects exist, what the modules hold, the latest audit — change on a
 * scale of hours. Reading them once and keeping them for a few minutes is the
 * difference between a reply that lands and one the person waits through.
 *
 * In memory, per server instance: a restart or a second instance simply reads
 * again. Nothing here is a source of truth.
 */

const DEFAULT_TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 500;

const held = new Map<string, { at: number; value: Promise<unknown> }>();

/**
 * The cached value for `key`, or `read()`'s result kept for `ttlMs`.
 *
 * The promise is cached, not the value, so two turns that ask at the same
 * moment share one read instead of racing. A read that fails is dropped, so
 * the next turn tries again rather than caching the failure.
 */
export async function cached<T>(
  key: string,
  read: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
  const hit = held.get(key);
  if (hit && Date.now() - hit.at < ttlMs) {
    // The map holds promises of every shape, so the value comes back as
    // unknown; the key is what ties it to this caller's type.
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
    return hit.value as Promise<T>;
  }
  const value = read();
  if (held.size > MAX_ENTRIES) held.clear();
  held.set(key, { at: Date.now(), value });
  value.catch(() => held.delete(key));
  return value;
}

/** Drops everything held for one workspace, after something it describes changed. */
export function forgetCached(prefix: string) {
  for (const key of held.keys()) {
    if (key.startsWith(prefix)) held.delete(key);
  }
}
