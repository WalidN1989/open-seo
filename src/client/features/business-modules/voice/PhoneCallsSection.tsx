import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PhoneIncoming } from "lucide-react";
import { listPhoneCalls } from "@/serverFunctions/voiceCalls";

function when(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function length(seconds: number | null) {
  if (!seconds) return "";
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${Math.round(seconds % 60)}s` : `${seconds}s`;
}

function label(key: string) {
  return key
    .replace(/^caller_/, "")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Calls answered by the hosted voice agent (ElevenLabs), each already turned
 * into a CRM contact and lead by the post-call webhook.
 */
export function PhoneCallsSection() {
  const query = useQuery({
    queryKey: ["voice", "phone-calls"],
    queryFn: () => listPhoneCalls(),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const [open, setOpen] = useState<string | null>(null);
  const calls = query.data ?? [];

  return (
    <section className="space-y-3 rounded-xl border border-base-300 p-4">
      <div className="flex items-center gap-2">
        <PhoneIncoming className="size-4" />
        <h2 className="font-semibold">Phone calls</h2>
        <span className="text-sm text-base-content/55">
          answered by your voice agent
        </span>
      </div>
      {query.isPending ? (
        <span className="loading loading-spinner loading-sm" />
      ) : calls.length === 0 ? (
        <p className="text-sm text-base-content/60">
          No calls yet. Connect ElevenLabs under Integrations and add its
          post-call webhook; every call then lands here and in the CRM.
        </p>
      ) : (
        <ul className="divide-y divide-base-300">
          {calls.map((call) => {
            const expanded = open === call.id;
            return (
              <li key={call.id} className="py-3">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left"
                  onClick={() => setOpen(expanded ? null : call.id)}
                >
                  <span className="font-medium">
                    {call.contact?.name ?? "Unknown caller"}
                  </span>
                  <span className="text-sm text-base-content/60">
                    {call.callerNumber ?? "no number"}
                  </span>
                  {call.captured.service_interest ? (
                    <span className="badge badge-ghost badge-sm">
                      {call.captured.service_interest}
                    </span>
                  ) : null}
                  <span className="ml-auto text-xs text-base-content/55">
                    {when(call.startedAt)} {length(call.durationSeconds)}
                  </span>
                </button>
                {call.summary ? (
                  <p className="mt-1 text-sm text-base-content/75">
                    {call.summary}
                  </p>
                ) : null}
                {expanded ? (
                  <div className="mt-3 grid gap-3 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                    <dl className="grid content-start gap-1">
                      {Object.entries(call.captured).map(([key, value]) => (
                        <div
                          key={key}
                          className="grid grid-cols-[7rem_1fr] gap-2"
                        >
                          <dt className="text-base-content/55">{label(key)}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                      <div className="grid grid-cols-[7rem_1fr] gap-2">
                        <dt className="text-base-content/55">Lead</dt>
                        <dd>
                          {call.lead
                            ? `${call.lead.title} (${call.lead.status})`
                            : "none"}
                        </dd>
                      </div>
                      <div className="grid grid-cols-[7rem_1fr] gap-2">
                        <dt className="text-base-content/55">WhatsApp</dt>
                        <dd>{call.welcomeStatus ?? "not attempted"}</dd>
                      </div>
                    </dl>
                    <div className="max-h-80 space-y-1 overflow-auto rounded-lg bg-base-200/60 p-3">
                      {call.transcript.map((turn, index) => (
                        <p key={index}>
                          <span className="font-medium">
                            {turn.role === "agent" ? "Agent" : "Caller"}:
                          </span>{" "}
                          {turn.message}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
