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
  // The workspace currency and the rest of the business settings. Every
  // screen that shows money reads this one answer, so a stale one prices a
  // Sri Lankan catalogue in Australian dollars.
  "business",
  "business-modules",
  "commerce",
  "crm",
  "email",
  "performance",
  "integrations",
  "social",
  "sms",
  "team",
  "invoicing",
  "invoice",
  "quotes",
  "quote",
  "clients",
  "client-accounts",
  "client-reports",
  "voice",
  "voice-greeting",
  "voice-lessons",
  "voice-name",
  "whatsapp",
] as const;

/**
 * Exported for the guard in the test file, which reads every business-module
 * query key out of the source and fails if one is not listed here. Three had
 * been missed by hand — a module's cached "nothing here" was surviving a
 * workspace switch and reading as the module being empty.
 */
export { ORGANIZATION_SCOPED_QUERY_ROOTS };

/** Called only after the previous workspace UI (including voice) unmounts. */
export async function discardWorkspaceQueries(
  queryClient: QueryClient,
): Promise<void> {
  const roots = new Set<string>(ORGANIZATION_SCOPED_QUERY_ROOTS);
  const filters = {
    predicate: (query: { queryKey: readonly unknown[] }) =>
      typeof query.queryKey[0] === "string" && roots.has(query.queryKey[0]),
  };
  await queryClient.cancelQueries(filters);
  queryClient.removeQueries(filters);
}
