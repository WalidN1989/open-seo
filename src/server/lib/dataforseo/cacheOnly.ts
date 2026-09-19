import { getRequest } from "@tanstack/react-start/server";
import { CACHE_ONLY_HEADER } from "@/shared/cache-only";

/**
 * Whether the request being served asked to be answered from cache only.
 * Outside a request — a workflow, a scheduled job — there is no such ask.
 */
export function isCacheOnlyRequest() {
  try {
    return getRequest().headers.get(CACHE_ONLY_HEADER) === "1";
  } catch {
    return false;
  }
}
