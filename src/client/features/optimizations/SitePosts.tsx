import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ExternalLink, ImageOff } from "lucide-react";
import { listSiteBlogPosts } from "@/serverFunctions/optimizations";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

/**
 * What the site already publishes.
 *
 * Read before writing. A keyword the site already covers is usually better
 * served by improving that article than by publishing a second one beside
 * it, where the two compete for the same search.
 */
export function SitePosts({ projectId }: { projectId: string }) {
  const posts = useQuery({
    queryKey: ["optimizations", "site-posts", projectId],
    queryFn: () => listSiteBlogPosts({ data: { projectId } }),
    staleTime: 5 * 60_000,
  });

  if (posts.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner" />
      </div>
    );
  }
  if (posts.isError) {
    return (
      <div className="alert alert-error">
        {getStandardErrorMessage(posts.error)}
      </div>
    );
  }
  if (!posts.data?.connected) {
    return (
      <p className="rounded-xl border border-dashed border-base-300 p-8 text-center text-sm text-base-content/60">
        No website is connected for this project yet, so there is nothing to
        read. Connect it under Integrations → Lovable site.
      </p>
    );
  }

  const rows = posts.data.posts;
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-base-300 p-8 text-center text-sm text-base-content/60">
        This site has no blog posts yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-base-content/60">
        {rows.length} article{rows.length === 1 ? "" : "s"} live on the site.
        Before writing a new one, check whether improving one of these would do
        more: two articles on the same search compete with each other.
      </p>
      <div className="overflow-x-auto rounded-xl border border-base-300">
        <table className="table">
          <thead>
            <tr>
              <th>Article</th>
              <th>Published</th>
              <th>Written for</th>
              <th className="text-right">Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((post) => (
              <tr key={post.slug}>
                <td className="max-w-md">
                  <span className="block truncate font-medium">
                    {post.title}
                  </span>
                  <span className="block truncate text-xs text-base-content/50">
                    /blog/{post.slug}
                    {post.hasImage ? null : (
                      <span className="ml-2 inline-flex items-center gap-1 text-warning">
                        <ImageOff className="size-3" /> no image
                      </span>
                    )}
                  </span>
                </td>
                <td className="whitespace-nowrap text-sm text-base-content/70">
                  <span className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-base-content/40" />
                    {post.date || "—"}
                  </span>
                </td>
                <td className="max-w-xs truncate text-sm text-base-content/60">
                  {post.keyword ?? "—"}
                </td>
                <td className="text-right">
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-ghost btn-xs gap-1"
                  >
                    View <ExternalLink className="size-3" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
