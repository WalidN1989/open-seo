/**
 * What a verified client may ask about, and nothing else.
 *
 * This list is the allowlist. It is declared away from the queries so the set
 * of readable things is one short list a person can check, rather than
 * something you work out by reading every branch.
 *
 * Deliberately absent, and why:
 * - Search Console and Analytics. Both are fetched live from Google per
 *   request; a chat reply is the wrong place to hold a token exchange open.
 * - Prompt explorer and share of voice. Both spend money per run, and a
 *   customer typing a question must never be able to spend it.
 * Everything here is already in our own tables, so answering costs nothing.
 */
export const CLIENT_DATA_TOPICS = [
  "overview",
  "rankings",
  "keywords",
  "backlinks",
  "content",
  "site_health",
] as const;

export type ClientDataTopic = (typeof CLIENT_DATA_TOPICS)[number];

export function isClientDataTopic(value: unknown): value is ClientDataTopic {
  return (
    typeof value === "string" &&
    (CLIENT_DATA_TOPICS as readonly string[]).includes(value)
  );
}

/** What the model is told each topic covers, so it picks the right one. */
export const CLIENT_DATA_TOPIC_HELP: Record<ClientDataTopic, string> = {
  overview: "which websites we look after for them, and what work is running",
  rankings:
    "where their tracked keywords currently sit in Google, and movement",
  keywords: "the keywords saved for their site, with search volume",
  backlinks: "how many sites link to them, and recent gains or losses",
  content: "articles and page changes we have proposed, and their status",
  site_health: "the last technical crawl of their site and what it found",
};
