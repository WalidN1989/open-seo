import { RefreshCw } from "lucide-react";

const INTERVALS = [
  { value: 15, label: "Check every 15 minutes" },
  { value: 60, label: "Check every hour" },
  { value: 360, label: "Check every 6 hours" },
  { value: 1440, label: "Check once a day" },
];

/** Matches the server's reclaim threshold. */
const STALE_RUN_MS = 4 * 60_000;

type SyncConnection = {
  syncedCount: number;
  syncStatus: string;
  syncError: string | null;
  lastSyncedAt: string | null;
  autoSync: boolean;
  syncIntervalMinutes: number;
  healthDetail: string | null;
  updatedAt: string;
};

/**
 * Sync progress. A catalogue of a few thousand products finishes across
 * several scheduler runs, so this shows how far it has got rather than a
 * count that sits still until everything is done.
 */
export function CatalogueSyncPanel({
  connection,
  onSync,
  onSchedule,
  syncPending,
  schedulePending,
}: {
  connection: SyncConnection;
  onSync: () => void;
  onSchedule: (input: {
    autoSync: boolean;
    syncIntervalMinutes: number;
  }) => void;
  syncPending: boolean;
  schedulePending: boolean;
}) {
  const inFlight =
    connection.syncStatus === "running" || connection.syncStatus === "queued";
  // A run whose process died leaves "running" behind. The scheduler reclaims
  // it, but leaving the button disabled until then makes a stuck sync look
  // unrecoverable, so offer the retry as soon as it is plainly not running.
  const stalled =
    connection.syncStatus === "running" &&
    Date.now() - new Date(connection.updatedAt).getTime() > STALE_RUN_MS;
  // The health check counts the store; syncedCount counts what has landed
  // here. Together they turn "0 imported" into visible progress.
  const storeTotal = Number(
    /([\d,]+) products found/
      .exec(connection.healthDetail ?? "")?.[1]
      ?.replace(/,/g, "") ?? "",
  );

  return (
    <div className="rounded-xl border border-base-300 p-4">
      <h2 className="text-sm font-semibold">Catalogue sync</h2>
      <p className="mt-1 text-xs text-base-content/60">
        {connection.syncedCount.toLocaleString()}
        {storeTotal ? ` of ${storeTotal.toLocaleString()}` : ""} products
        imported
      </p>
      {inFlight && storeTotal ? (
        <progress
          className="progress progress-primary mt-2 h-1 w-full"
          value={Math.min(connection.syncedCount, storeTotal)}
          max={storeTotal}
        />
      ) : null}
      {connection.lastSyncedAt ? (
        <p className="mt-1 text-xs text-base-content/40">
          Last synced {new Date(connection.lastSyncedAt).toLocaleString()}
        </p>
      ) : null}
      {connection.syncError ? (
        <p className="mt-2 text-xs text-error">{connection.syncError}</p>
      ) : null}
      <button
        className="btn btn-outline btn-xs mt-3 w-full"
        disabled={syncPending || (inFlight && !stalled)}
        onClick={onSync}
      >
        <RefreshCw className="size-3" />
        {stalled
          ? "Retry sync"
          : connection.syncStatus === "running"
            ? "Syncing..."
            : connection.syncStatus === "queued"
              ? "Queued..."
              : "Sync now"}
      </button>
      {stalled ? (
        <p className="mt-2 text-xs text-warning">
          This run stopped responding, most likely a restart part-way through.
          Retrying picks it up from a clean pass.
        </p>
      ) : null}

      <label className="mt-4 flex items-center justify-between gap-2 text-xs">
        <span>Keep in sync automatically</span>
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          checked={connection.autoSync}
          disabled={schedulePending}
          onChange={(event) =>
            onSchedule({
              autoSync: event.target.checked,
              syncIntervalMinutes: connection.syncIntervalMinutes,
            })
          }
        />
      </label>
      <select
        className="select select-bordered select-sm mt-2 w-full"
        value={connection.syncIntervalMinutes}
        disabled={schedulePending || !connection.autoSync}
        onChange={(event) =>
          onSchedule({
            autoSync: connection.autoSync,
            syncIntervalMinutes: Number(event.target.value),
          })
        }
      >
        {INTERVALS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="mt-2 text-xs text-base-content/40">
        Only products changed since the last check are fetched, so price and
        stock edits in your store appear here on their own.
      </p>
    </div>
  );
}
