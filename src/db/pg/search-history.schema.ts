import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { projects, isoNow } from "./app.schema";

/**
 * What has been looked up on a project, wherever it was looked up from.
 *
 * The recent-search lists were browser storage, so research done at home was
 * invisible at the office and the same query got bought twice. Shared across
 * the whole project rather than per person: the cost this avoids is a
 * colleague re-buying what someone already ran, and that only works if they
 * can see it.
 *
 * `itemKey` is the client's own idea of "the same search" — a keyword and a
 * location, a domain and a scope — so re-running one moves it to the top
 * instead of adding a duplicate.
 */
export const projectSearchHistory = pgTable(
  "project_search_history",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** keywords | domain | backlinks | brand_lookup | prompt_explorer */
    module: text("module").notNull(),
    itemKey: text("item_key").notNull(),
    /** The whole entry as the module's own UI stores it. */
    itemJson: text("item_json").notNull(),
    /** Who ran it, so a team can tell whose search it was. */
    ranByUserId: text("ran_by_user_id"),
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("project_search_history_unique_entry").on(
      table.projectId,
      table.module,
      table.itemKey,
    ),
    index("project_search_history_recent_idx").on(
      table.projectId,
      table.module,
      table.createdAt,
    ),
  ],
);
