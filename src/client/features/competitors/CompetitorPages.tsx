import type { getCompetitors } from "@/serverFunctions/competitors";

type Overview = Awaited<ReturnType<typeof getCompetitors>>;

function RankBadge({ rank }: { rank: number }) {
  return <span className="badge badge-ghost badge-sm font-mono">#{rank}</span>;
}

/**
 * The searches rivals built a page for and this site did not.
 *
 * Listed first because it is the only view here that says what to do next.
 */
export function PageGaps({ gaps }: { gaps: Overview["gaps"] }) {
  if (!gaps.length) {
    return (
      <p className="text-sm text-base-content/60">
        No gap found yet. A search counts when two or more competitors answer it
        with a page of their own and this site answers with its homepage, or not
        at all.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-sm text-base-content/65">
        Each of these is a search where rivals have built a page and this site
        has not. That is the case for writing one: not that they have it, but
        that the homepage is being asked to answer several searches at once and
        Google will only pick one.
      </p>
      {gaps.map((gap) => (
        <div
          key={gap.keyword}
          className="rounded-xl border border-base-300 p-4"
        >
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium">{gap.keyword}</span>
            <span className="text-sm text-base-content/60">
              {gap.dedicated.length} competitors have a page for this
            </span>
            <span className="ml-auto text-sm">
              {gap.ours ? (
                <>
                  You rank <RankBadge rank={gap.ours.rank} /> with your homepage
                </>
              ) : (
                <span className="text-base-content/55">You do not appear</span>
              )}
            </span>
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {gap.dedicated.map((page) => (
              <li
                key={page.url}
                className="flex flex-wrap items-baseline gap-2"
              >
                <RankBadge rank={page.rank} />
                <a
                  href={page.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="link link-hover break-all"
                >
                  {page.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Every page a rival ranks with, most committed rival first. */
export function CompetitorPageList({ pages }: { pages: Overview["pages"] }) {
  if (!pages.length) {
    return (
      <p className="text-sm text-base-content/60">
        Nothing yet. Open the search results for a few of your keywords and the
        pages your rivals rank with will appear here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {pages.map((competitor) => (
        <div
          key={competitor.domain}
          className="rounded-xl border border-base-300 p-4"
        >
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium">{competitor.domain}</span>
            <span className="text-sm text-base-content/55">
              {competitor.pages.filter((page) => page.dedicated).length} built
              pages of {competitor.pages.length} ranking
            </span>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {competitor.pages.map((page) => (
              <li key={page.url}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <RankBadge rank={page.rank} />
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="link link-hover break-all"
                  >
                    {page.url}
                  </a>
                  {page.dedicated ? null : (
                    <span className="badge badge-ghost badge-sm">homepage</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-base-content/55">
                  {page.keywords.join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
