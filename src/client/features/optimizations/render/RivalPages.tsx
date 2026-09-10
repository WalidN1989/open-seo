import { useQuery } from "@tanstack/react-query";
import { getCompetitorEvidence } from "@/serverFunctions/competitors";

/**
 * What rivals have built for this search.
 *
 * The most persuasive line in a client report is not "this term gets fifteen
 * impressions" — it is "four competitors have a page for this and you have a
 * blog post". This says the second thing, from search results already paid for.
 */
export function RivalPages({
  projectId,
  keyword,
}: {
  projectId: string;
  keyword: string | null;
}) {
  const query = useQuery({
    queryKey: ["competitor-evidence", projectId, keyword],
    queryFn: () =>
      getCompetitorEvidence({ data: { projectId, keyword: keyword! } }),
    enabled: Boolean(keyword),
  });

  if (!keyword || !query.data || !query.data.dedicated.length) return null;
  const { dedicated, ours } = query.data;

  return (
    <section>
      <h3 className="text-sm font-semibold">
        What your competitors built for this
      </h3>
      <p className="mt-1 text-sm text-base-content/70">
        {dedicated.length === 1
          ? "One competitor answers this search with a page of its own."
          : `${dedicated.length} competitors answer this search with a page of their own.`}{" "}
        {ours
          ? "You answer it with your homepage, which is also trying to answer everything else."
          : "You do not appear for it at all."}
      </p>
      <ol className="mt-3 space-y-1.5 text-sm">
        {dedicated.map((page) => (
          <li key={page.url} className="flex flex-wrap items-baseline gap-2">
            <span className="badge badge-ghost badge-sm font-mono">
              #{page.rank}
            </span>
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
      </ol>
    </section>
  );
}
