import { useCallback, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Building2 } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { useWorkspaceCurrency } from "@/client/hooks/useWorkspaceCurrency";
import { TEMPERATURES } from "@/shared/lead-journal";
import { ActivityJournal } from "./ActivityJournal";
import { FollowUpCard } from "./FollowUpCard";
import { buildJournal } from "./journalEntries";
import { CompanyCard, ContactCard, OutreachCard } from "./LeadRailCards";
import { LogActivityDialog } from "./LogActivityDialog";
import { useLeadDetail, type LeadDetail } from "./useLeadDetail";

export function LeadDetailPage({ leadId }: { leadId: string }) {
  const { query, update, log, remind } = useLeadDetail(leadId);
  const [logging, setLogging] = useState(false);
  const openLog = useCallback(() => setLogging(true), []);
  const detail = query.data;
  const journal = useMemo(() => (detail ? buildJournal(detail) : []), [detail]);

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner loading-md" />
      </div>
    );
  }
  if (query.isError || !detail) {
    return (
      <div className="alert alert-warning">
        {getStandardErrorMessage(query.error, "This lead could not be loaded.")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <LeadHeader
        detail={detail}
        onStatus={(status) => update.mutate({ status })}
        onStage={(stageId) => update.mutate({ stageId })}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <IdentityCard detail={detail} />
          <ActivityJournal entries={journal} onAdd={openLog} />
        </div>
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <FollowUpCard
            detail={detail}
            lastContactAt={journal[0]?.at ?? detail.lead.lastActivityAt}
            saving={update.isPending}
            onSave={(changes) => update.mutate(changes)}
            onRemind={(input) => remind.mutate(input)}
          />
          <OutreachCard detail={detail} />
          <ContactCard detail={detail} />
          <CompanyCard detail={detail} />
        </aside>
      </div>

      {logging ? (
        <LogActivityDialog
          saving={log.isPending}
          onClose={() => setLogging(false)}
          onSave={(input) =>
            log.mutate(input, { onSuccess: () => setLogging(false) })
          }
        />
      ) : null}
    </div>
  );
}

function LeadHeader({
  detail,
  onStatus,
  onStage,
}: {
  detail: LeadDetail;
  onStatus: (status: string) => void;
  onStage: (stageId: string) => void;
}) {
  const name = detail.company?.name ?? detail.lead.title;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        to="/modules/$moduleKey"
        params={{ moduleKey: "leads" }}
        className="flex items-center gap-1.5 text-sm text-base-content/55 hover:text-base-content"
      >
        <ArrowLeft className="size-4" />
        Leads /<span className="font-medium text-base-content">{name}</span>
      </Link>
      <div className="flex rounded-md border border-base-300 bg-base-100 p-0.5">
        {TEMPERATURES.map((temperature) => {
          const active = detail.lead.status === temperature.key;
          return (
            <button
              key={temperature.key}
              type="button"
              onClick={() => onStatus(active ? "new" : temperature.key)}
              className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                active
                  ? temperature.active
                  : "text-base-content/50 hover:bg-base-200"
              }`}
            >
              {temperature.label}
            </button>
          );
        })}
      </div>
      <select
        className="select select-bordered select-sm ml-auto w-44"
        value={detail.lead.stageId ?? ""}
        onChange={(event) => onStage(event.target.value)}
        aria-label="Pipeline stage"
      >
        <option value="" disabled>
          Stage
        </option>
        {detail.stages.map((stage) => (
          <option key={stage.id} value={stage.id}>
            {stage.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function IdentityCard({ detail }: { detail: LeadDetail }) {
  const money = useWorkspaceCurrency();
  const { lead, company, stage } = detail;
  const subtitle = [company?.industry, company?.country]
    .filter(Boolean)
    .join(" · ");
  const interests = [lead.title, lead.category].filter(
    (value): value is string => Boolean(value),
  );
  return (
    <div className="rounded-xl border border-base-300 bg-base-100 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-base-200 ring-1 ring-base-300">
          <Building2 className="size-5 text-base-content/50" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">
            {company?.name ?? lead.title}
          </h1>
          <p className="text-sm text-base-content/55">
            {subtitle || lead.source || "Lead"}
            {lead.valueCents > 0
              ? ` · ${money.format(lead.valueCents, true)}`
              : ""}
          </p>
        </div>
        {stage ? (
          <span className="flex items-center gap-1.5 rounded-full border border-base-300 px-2 py-1 text-xs font-medium">
            <span className="size-2 rounded-full bg-primary" />
            {stage.name}
          </span>
        ) : null}
      </div>
      {interests.length ? (
        <div className="mt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-base-content/50">
            Interested in
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {interests.map((interest) => (
              <span
                key={interest}
                className="rounded-md bg-base-200 px-2 py-0.5 text-xs"
              >
                {interest}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
