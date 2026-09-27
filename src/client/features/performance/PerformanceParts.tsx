import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { setActiveProject } from "@/serverFunctions/projects";
import { resetOrganizationScopedQueries } from "@/client/lib/organization-scoped-queries";
import type {
  EngineeringSignal,
  PerformanceRecord,
} from "@/shared/performance";

export function RecordList({ records }: { records: PerformanceRecord[] }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState(false);
  async function open(record: PerformanceRecord) {
    setOpening(record.id);
    setError(false);
    try {
      await setActiveProject({ data: { projectId: record.projectId } });
      await resetOrganizationScopedQueries(client);
      await navigate({ href: record.path });
    } catch {
      setError(true);
    } finally {
      setOpening(null);
    }
  }
  return (
    <div className="divide-y divide-base-300">
      {error && (
        <p role="alert" className="p-3 text-error">
          Could not open this workspace. Please refresh and try again.
        </p>
      )}
      {records.map((record) => (
        <button
          key={record.id}
          disabled={opening !== null}
          onClick={() => void open(record)}
          className="block w-full px-4 py-3 text-left hover:bg-base-200 disabled:opacity-60"
        >
          <div className="break-words text-sm font-medium">{record.title}</div>
          <div className="mt-1 break-words text-xs text-base-content/65">
            {record.projectName} · {record.detail}
          </div>
          <div className="mt-1 text-xs text-base-content/50">
            {record.timestamp
              ? new Date(record.timestamp).toLocaleString()
              : "No event time recorded"}
            {opening === record.id ? " · Opening…" : ""}
          </div>
        </button>
      ))}
    </div>
  );
}

export function Signals({ signals }: { signals: EngineeringSignal[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {signals.map((signal) => (
        <div key={signal.id} className="rounded-lg border border-base-300 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{signal.system}</span>
            <span
              className={`badge badge-sm ${signal.status === "healthy" ? "badge-success" : signal.status === "attention" ? "badge-error" : "badge-ghost"}`}
            >
              {signal.status.replaceAll("_", " ")}
            </span>
          </div>
          <p className="mt-2 break-words text-sm text-base-content/70">
            {signal.evidence}
          </p>
          <p className="mt-2 text-xs text-base-content/50">
            Checked {new Date(signal.observedAt).toLocaleString()}
            {signal.eventAt
              ? ` · Event ${new Date(signal.eventAt).toLocaleString()}`
              : ""}
          </p>
          {signal.url && (
            <a
              href={signal.url}
              target="_blank"
              rel="noopener noreferrer"
              className="link mt-2 inline-block text-xs"
            >
              Open evidence ↗
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
