import { useEffect, useRef } from "react";
import {
  closeCacheOnlyWindow,
  isCacheOnlyWindowOpen,
  openCacheOnlyWindow,
} from "@/client/lib/cacheOnlyWindow";

/** The newest item by its own timestamp; the list is not kept in order. */
export function latestByTimestamp<T extends { timestamp: number }>(
  items: readonly T[],
): T | null {
  let latest: T | null = null;
  for (const item of items) {
    if (!latest || item.timestamp > latest.timestamp) latest = item;
  }
  return latest;
}

/**
 * Opens the newest saved search when a research page is visited with nothing
 * selected — once per visit and per project, and only when it can be shown
 * from saved data.
 *
 * - An explicit selection in the address settles it: nothing is opened, and
 *   going back to Recent searches later stays there.
 * - It waits for the project's history to arrive from the server, so a fresh
 *   browser is not mistaken for one with no history.
 * - `probe` asks for the saved result inside the cache-only window; a miss,
 *   an error or an empty result leaves the page on Recent searches.
 * - Anything the person does first — a click, a key, another search — closes
 *   the window, and a probe that returns after that is ignored.
 */
export function useAutoOpenLatest<T extends { timestamp: number }>(input: {
  projectId: string;
  hasExplicitSelection: boolean;
  historySynced: boolean;
  history: readonly T[];
  probe: (item: T) => Promise<boolean>;
  open: (item: T) => void;
}) {
  const { projectId, hasExplicitSelection, historySynced, history } = input;
  const decidedFor = useRef<string | null>(null);
  const latestInput = useRef(input);
  useEffect(() => {
    latestInput.current = input;
  });

  useEffect(() => {
    if (decidedFor.current === projectId) return;
    if (hasExplicitSelection) {
      decidedFor.current = projectId;
      return;
    }
    if (!historySynced) return;
    decidedFor.current = projectId;
    const latest = latestByTimestamp(history);
    if (!latest) return;

    openCacheOnlyWindow();
    void latestInput.current
      .probe(latest)
      .catch(() => false)
      .then((found) => {
        const current = latestInput.current;
        const stillWanted =
          isCacheOnlyWindowOpen() &&
          current.projectId === projectId &&
          !current.hasExplicitSelection;
        if (found && stillWanted) {
          current.open(latest);
        } else {
          closeCacheOnlyWindow();
        }
      });
  }, [hasExplicitSelection, history, historySynced, projectId]);

  // Leaving the page or the project ends the window with it.
  useEffect(() => () => closeCacheOnlyWindow(), [projectId]);
}
