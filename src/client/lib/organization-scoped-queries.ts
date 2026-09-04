import type { QueryClient } from "@tanstack/react-query";

/**
 * Cached answers that belong to an organization rather than to a project.
 *
 * The SEO queries all carry the project id in their key — ["dashboardOverview",
 * projectId] and so on — so switching project already gives them a different
 * cache entry and they need no help. These do not: the business modules read
 * the active organization and key on the module alone, which was correct while
 * an organization could not change inside a session, and wrong the moment
 * switching project switches organization.
 */
const ORGANIZATION_SCOPED_QUERY_ROOTS = [
  "business-modules",
  "commerce",
  "crm",
  "integrations",
  "voice",
  "whatsapp",
] as const;

/**
 * Discards the previous client's business-module data when the project
 * changes.
 *
 * Reset rather than clear: clearing removes queries that mounted components
 * are still observing, and an observer left without a query sits in its
 * loading state until something remounts it — which is how a blanket clear
 * left the dashboard showing skeletons until you navigated away and back.
 * Reset empties the data and refetches whatever is on screen.
 *
 * Reset rather than invalidate, too: invalidating leaves the old answer
 * visible until the refetch lands, and here the old answer belongs to a
 * different client.
 */
export async function resetOrganizationScopedQueries(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all(
    ORGANIZATION_SCOPED_QUERY_ROOTS.map((root) =>
      queryClient.resetQueries({ queryKey: [root] }),
    ),
  );
}
