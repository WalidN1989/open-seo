import { text, uniqueIndex, sqliteTable } from "drizzle-orm/sqlite-core";
import { rankCheckRuns } from "./app.schema";

// Frozen intended coverage, retained when a tracked keyword is removed.
export const rankCheckRunTargets = sqliteTable(
  "rank_check_run_targets",
  {
    runId: text("run_id")
      .notNull()
      .references(() => rankCheckRuns.id, { onDelete: "cascade" }),
    trackingKeywordId: text("tracking_keyword_id").notNull(),
    keyword: text("keyword").notNull(),
    device: text("device", { enum: ["desktop", "mobile"] }).notNull(),
  },
  (table) => [
    uniqueIndex("rank_check_run_targets_run_keyword_device_idx").on(
      table.runId,
      table.trackingKeywordId,
      table.device,
    ),
  ],
);
