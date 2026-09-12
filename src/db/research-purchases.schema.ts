import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { organization } from "./better-auth-schema";

/**
 * Every paid research call, recorded as it is made.
 *
 * Written from inside the meter that charges for the call, so there is no way
 * to buy research without it landing here — a new module gets this by existing,
 * not by remembering. That is the point: the app has twice now spent money on
 * research that was shown once and never stored, and the fix both times was to
 * patch one more call site.
 *
 * This is a ledger, not a cache. It says what was bought, for whom, and with
 * what arguments. The results themselves live in the tables that understand
 * them — keyword metrics, SERP observations, audits — and in the payload cache.
 */
export const researchPurchases = sqliteTable(
  "research_purchases",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Not a foreign key: a call can be made before a project exists. */
    projectId: text("project_id"),
    userId: text("user_id"),
    /** Which vendor endpoint, e.g. "keywords.related" or "serp.live". */
    endpoint: text("endpoint").notNull(),
    /** What it was billed against, when the caller said. */
    creditFeature: text("credit_feature"),
    /** The arguments, so a repeat purchase is recognisable as one. */
    inputJson: text("input_json"),
    /** ok | failed — a failed call can still have cost money. */
    outcome: text("outcome").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("research_purchases_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("research_purchases_project_idx").on(table.projectId, table.endpoint),
  ],
);
