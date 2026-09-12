import { useCallback, useEffect, useRef, useState } from "react";
import {
  addSearchHistory,
  clearSearchHistory,
  listSearchHistory,
  removeSearchHistory,
} from "@/serverFunctions/searchHistory";
import type { searchHistoryModules } from "@/types/schemas/search-history";

/**
 * Where a module's recent-search list lives.
 *
 * It used to be browser storage alone, which meant research done at home was
 * invisible at the office and the same query got bought twice. The server is
 * now the record; local storage stays as the thing that paints the list before
 * the request lands, and as the fallback when the request fails.
 */
type SyncOptions<TItem> = {
  projectId: string;
  module: (typeof searchHistoryModules)[number];
  /** What counts as the same search, for dedupe across devices. */
  itemKey: (item: TItem) => string;
};

type UseLocalHistoryStoreOptions<TItem, TAddInput> = {
  storageKey: string;
  maxItems?: number;
  parse: (raw: string) => TItem[] | null;
  isSameItem: (existing: TItem, next: TAddInput) => boolean;
  createItem: (input: TAddInput) => TItem;
  getItemKey: (item: TItem) => number;
  sync?: SyncOptions<TItem>;
};

function loadHistory<TItem>(
  storageKey: string,
  parse: (raw: string) => TItem[] | null,
  maxItems: number,
): TItem[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];

    const parsed = parse(raw);
    return parsed ? parsed.slice(0, maxItems) : [];
  } catch {
    return [];
  }
}

function saveHistory<TItem>(storageKey: string, items: TItem[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(items));
  } catch {
    // storage full or unavailable - silently ignore
  }
}

export function useLocalHistoryStore<TItem, TAddInput>({
  storageKey,
  maxItems = 20,
  parse,
  isSameItem,
  createItem,
  getItemKey,
  sync,
}: UseLocalHistoryStoreOptions<TItem, TAddInput>) {
  const parseRef = useRef(parse);
  const syncRef = useRef(sync);
  const [history, setHistory] = useState<TItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    parseRef.current = parse;
    syncRef.current = sync;
  }, [parse, sync]);

  useEffect(() => {
    const local = loadHistory(storageKey, parseRef.current, maxItems);
    setHistory(local);
    setIsLoaded(true);

    const options = syncRef.current;
    if (!options) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listSearchHistory({
          data: { projectId: options.projectId, module: options.module },
        });
        if (cancelled) return;
        // Parsed through the module's own schema rather than asserted: these
        // rows were written by an older version of this code as easily as by
        // the current one.
        const fromServer =
          parseRef.current(`[${rows.map((row) => row.itemJson).join(",")}]`) ??
          [];
        // Anything this browser has that the server does not is pushed up, so
        // the first load after the change carries old local history over
        // instead of discarding it.
        const known = new Set(rows.map((row) => row.itemKey));
        for (const item of local) {
          const key = options.itemKey(item);
          if (known.has(key)) continue;
          void addSearchHistory({
            data: {
              projectId: options.projectId,
              module: options.module,
              itemKey: key,
              item,
            },
          }).catch(() => undefined);
          fromServer.push(item);
        }
        const merged = fromServer.slice(0, maxItems);
        setHistory(merged);
        saveHistory(storageKey, merged);
      } catch {
        // Offline or refused: the local list is still shown.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [maxItems, storageKey]);

  const addItem = useCallback(
    (input: TAddInput) => {
      setHistory((prev) => {
        const filtered = prev.filter(
          (existing) => !isSameItem(existing, input),
        );
        const item = createItem(input);
        const next = [item, ...filtered].slice(0, maxItems);
        saveHistory(storageKey, next);
        const options = syncRef.current;
        if (options) {
          void addSearchHistory({
            data: {
              projectId: options.projectId,
              module: options.module,
              itemKey: options.itemKey(item),
              item,
            },
          }).catch(() => undefined);
        }
        return next;
      });
    },
    [createItem, isSameItem, maxItems, storageKey],
  );

  const removeItem = useCallback(
    (itemKey: number) => {
      setHistory((prev) => {
        const going = prev.find((item) => getItemKey(item) === itemKey);
        const next = prev.filter((item) => getItemKey(item) !== itemKey);
        saveHistory(storageKey, next);
        const options = syncRef.current;
        if (options && going) {
          void removeSearchHistory({
            data: {
              projectId: options.projectId,
              module: options.module,
              itemKey: options.itemKey(going),
            },
          }).catch(() => undefined);
        }
        return next;
      });
    },
    [getItemKey, storageKey],
  );

  const clearItems = useCallback(() => {
    setHistory([]);
    saveHistory(storageKey, []);
    const options = syncRef.current;
    if (options) {
      void clearSearchHistory({
        data: { projectId: options.projectId, module: options.module },
      }).catch(() => undefined);
    }
  }, [storageKey]);

  return { history, isLoaded, addItem, removeItem, clearItems };
}
