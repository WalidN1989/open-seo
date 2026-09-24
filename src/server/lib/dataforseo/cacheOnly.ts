import { AsyncLocalStorage } from "node:async_hooks";
import { getRequest } from "@tanstack/react-start/server";
import { CACHE_ONLY_HEADER } from "@/shared/cache-only";

/**
 * Work that must be answered from what is already stored, never from a paid
 * provider call.
 *
 * Two ways in: a request carrying the cache-only header — a page opening the
 * latest saved result by itself — and `withCacheOnly`, which the voice agent
 * wraps its tool calls in until the person has agreed to spend.
 */

const scope = new AsyncLocalStorage<true>();

/** Runs `work` with every paid provider call refused. */
export function withCacheOnly<T>(work: () => Promise<T>): Promise<T> {
  return scope.run(true, work);
}

/**
 * Whether what is running now asked to be answered from cache only.
 * Outside a request — a workflow, a scheduled job — there is no such ask.
 */
export function isCacheOnlyRequest() {
  if (scope.getStore()) return true;
  try {
    return getRequest().headers.get(CACHE_ONLY_HEADER) === "1";
  } catch {
    return false;
  }
}
