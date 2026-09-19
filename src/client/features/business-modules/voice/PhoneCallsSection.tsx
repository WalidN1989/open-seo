import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PhoneIncoming, Globe, Clock, ChevronDown } from "lucide-react";
import "./calls.css";
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

/** Which agent took the call and where: the phone line or the website. */
function source(call: { provider: string; agentName: string | null }) {
  const website = call.provider === "deepgram";
  return {
    agent:
      call.agentName?.trim() || (website ? "Website agent" : "Phone agent"),
    channel: website ? "Website" : "Phone",
    badge: website ? "badge-secondary" : "badge-primary",
  };
}

function label(key: string) {
  return key
    .replace(/^caller_/, "")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Calls answered by the voice agents — the phone line (ElevenLabs) and the
 * website (Deepgram) — each already turned into a CRM contact and lead.
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
    <section className="voice-calls space-y-4">
      {query.isSuccess ? (
        <div className="voice-call-stats">
          {[
            { label: "Recent calls", value: calls.length, Icon: PhoneIncoming },
            {
              label: "Website calls",
              value: calls.filter((call) => call.provider === "deepgram")
                .length,
              Icon: Globe,
            },
            {
              label: "Recorded duration",
              value:
                length(
                  calls.reduce(
                    (total, call) => total + (call.durationSeconds ?? 0),
                    0,
                  ),
                ) || "0s",
              Icon: Clock,
            },
          ].map(({ label, value, Icon }) => (
            <div key={label} className="voice-call-stat">
              <span>
                <Icon className="size-5" />
              </span>
              <strong>{value}</strong>
              <p>{label}</p>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <PhoneIncoming className="size-4" />
        <h2 className="font-semibold">Call activity</h2>
        <span className="text-sm text-base-content/55">
          Select a call to view its transcript
        </span>
      </div>
      {query.isPending ? (
        <span className="loading loading-spinner loading-sm" />
      ) : query.isError ? (
        <p role="alert" className="alert alert-error">
          Calls could not be loaded. Please try again.
        </p>
      ) : calls.length === 0 ? (
        <p className="text-sm text-base-content/60">
          No calls yet. Connect ElevenLabs (phone line) or Deepgram (website
          voice agent) under Integrations; every call then lands here and in the
          CRM.
        </p>
      ) : (
        <ul className="voice-call-grid">
          {calls.map((call) => {
            const expanded = open === call.id;
            const from = source(call);
            return (
              <li
                key={call.id}
                className="voice-call-card"
                data-expanded={expanded}
              >
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left"
                  onClick={() => setOpen(expanded ? null : call.id)}
                  aria-expanded={expanded}
                >
                  <span
                    className={`badge badge-sm badge-outline ${from.badge}`}
                    title={`${from.channel} call`}
                  >
                    {from.agent} · {from.channel}
                  </span>
                  <span className="font-medium">
                    {call.contact?.name ?? "Unknown caller"}
                  </span>
                  <span className="text-sm text-base-content/60">
                    {call.callerNumber ?? "no number"}
                  </span>
                  {call.captured.service_interest ? (
                    <span className="voice-call-interest badge badge-ghost badge-sm">
                      {call.captured.service_interest}
                    </span>
                  ) : null}
                  <span className="ml-auto text-xs text-base-content/55">
                    {when(call.startedAt)} {length(call.durationSeconds)}
                  </span>
                  <ChevronDown
                    className={`size-4 shrink-0 ${expanded ? "rotate-180" : ""}`}
                  />
                </button>
                {call.summary ? (
                  <p
                    className={`voice-call-summary mt-3 text-sm text-base-content/75 ${expanded ? "" : "line-clamp-2"}`}
                  >
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
                      <div className="grid grid-cols-[7rem_1fr] gap-2">
                        <dt className="text-base-content/55">Recap email</dt>
                        <dd>{call.recapEmailStatus ?? "not attempted"}</dd>
                      </div>
                    </dl>
                    <div className="voice-call-transcript max-h-80 space-y-1 overflow-auto rounded-lg bg-base-200/60 p-3">
                      {call.transcript.length === 0 ? (
                        <p className="text-base-content/60">
                          No transcript available for this call.
                        </p>
                      ) : null}
                      {call.transcript.map((turn, index) => (
                        <p key={index}>
                          <span className="font-medium">
                            {turn.role === "agent" ? from.agent : "Caller"}:
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
