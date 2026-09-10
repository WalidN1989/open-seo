import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2 } from "lucide-react";
import {
  getCompetitors,
  trackCompetitor,
  untrackCompetitor,
} from "@/serverFunctions/competitors";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { CompetitorPageList, PageGaps } from "./CompetitorPages";

function Evidence({
  seen,
}: {
  seen: { keywords: number; bestRank: number; examples: string[] } | null;
}) {
  if (!seen) return null;
  return (
    <p className="mt-1 text-xs text-base-content/60">
      Appears for {seen.keywords} of your keywords, best position{" "}
      {seen.bestRank} · {seen.examples.join(", ")}
    </p>
  );
}

export function CompetitorsView({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");
  const [tab, setTab] = useState<"who" | "gaps" | "pages">("who");

  const query = useQuery({
    queryKey: ["competitors", projectId],
    queryFn: () => getCompetitors({ data: { projectId } }),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["competitors", projectId] });

  const track = useMutation({
    mutationFn: (input: { domain: string; name?: string }) =>
      trackCompetitor({ data: { projectId, ...input } }),
    onSuccess: async () => {
      setDomain("");
      setName("");
      await refresh();
    },
  });
  const untrack = useMutation({
    mutationFn: (value: string) =>
      untrackCompetitor({ data: { projectId, domain: value } }),
    onSuccess: refresh,
  });

  if (query.isPending) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner" />
      </div>
    );
  }
  if (!query.data) return null;
  const { tracked, discovered, keywordsSeen, pages, gaps } = query.data;

  const tabs = [
    { key: "who" as const, label: "Who", count: tracked.length },
    { key: "gaps" as const, label: "Page gaps", count: gaps.length },
    { key: "pages" as const, label: "Their pages", count: pages.length },
  ];

  return (
    <div className="space-y-8">
      <p className="max-w-2xl text-base text-base-content/65">
        Who this site competes with. Anything you track here is part of the
        project&rsquo;s shared context, so it appears in client reports and your
        AI agent can read it.
      </p>

      <div role="tablist" className="tabs tabs-bordered">
        {tabs.map((item) => (
          <button
            key={item.key}
            role="tab"
            className={`tab ${tab === item.key ? "tab-active" : ""}`}
            onClick={() => setTab(item.key)}
          >
            {item.label}
            {item.count ? (
              <span className="ml-2 text-xs opacity-60">{item.count}</span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "gaps" ? <PageGaps gaps={gaps} /> : null}
      {tab === "pages" ? <CompetitorPageList pages={pages} /> : null}

      {tab !== "who" ? null : (
        <>
          <section className="space-y-3 rounded-xl border border-base-300 p-5">
            <p className="text-sm font-semibold">Add a competitor</p>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <input
                className="input input-bordered"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="competitor.com.au"
                aria-label="Competitor domain"
              />
              <input
                className="input input-bordered"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="What you call them (optional)"
                aria-label="Competitor name"
              />
              <button
                className="btn btn-primary"
                disabled={!domain.trim() || track.isPending}
                onClick={() =>
                  track.mutate({ domain, name: name.trim() || undefined })
                }
              >
                <Plus className="size-4" /> Track
              </button>
            </div>
            {track.isError ? (
              <p className="text-sm text-error">
                {getStandardErrorMessage(track.error)}
              </p>
            ) : null}
          </section>

          <section>
            <h2 className="text-sm font-semibold">Tracked competitors</h2>
            {tracked.length ? (
              <ul className="mt-3 space-y-2">
                {tracked.map((competitor) => (
                  <li
                    key={competitor.domain}
                    className="rounded-lg border border-base-300 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {competitor.name || competitor.domain}
                      </span>
                      {competitor.name ? (
                        <span className="text-sm text-base-content/55">
                          {competitor.domain}
                        </span>
                      ) : null}
                      {competitor.updatedBy &&
                      competitor.updatedBy !== "user" ? (
                        <span className="badge badge-ghost badge-sm">
                          added by an agent
                        </span>
                      ) : null}
                      <button
                        className="btn btn-ghost btn-xs ml-auto text-error"
                        disabled={untrack.isPending}
                        onClick={() => untrack.mutate(competitor.domain)}
                        aria-label={`Stop tracking ${competitor.domain}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <Evidence seen={competitor.seen} />
                    {competitor.notes ? (
                      <p className="mt-1 text-sm text-base-content/70">
                        {competitor.notes}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-base-content/60">
                None yet. Track one below, or add it above.
              </p>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold">
              Seen in your search results
            </h2>
            <p className="mt-0.5 text-xs text-base-content/55">
              {keywordsSeen
                ? `From ${keywordsSeen} ${keywordsSeen === 1 ? "keyword" : "keywords"} you have looked at. Costs nothing — these come from searches already run.`
                : "Nothing yet. Open the SERP for a few of your keywords in Keyword Research and they will appear here."}
            </p>
            {discovered.length ? (
              <ul className="mt-3 space-y-2">
                {discovered.map((competitor) => (
                  <li
                    key={competitor.domain}
                    className="rounded-lg border border-base-300 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{competitor.domain}</span>
                      {competitor.referringDomains ? (
                        <span className="text-xs text-base-content/55">
                          {competitor.referringDomains} referring domains
                        </span>
                      ) : null}
                      <button
                        className="btn btn-ghost btn-xs ml-auto"
                        disabled={track.isPending}
                        onClick={() =>
                          track.mutate({ domain: competitor.domain })
                        }
                      >
                        <Plus className="size-3.5" /> Track
                      </button>
                    </div>
                    <Evidence seen={competitor} />
                  </li>
                ))}
              </ul>
            ) : keywordsSeen ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-base-content/60">
                <Search className="size-4" />
                No domain has turned up for two or more of your keywords yet.
              </p>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
