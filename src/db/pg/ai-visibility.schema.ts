import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  boolean,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./app.schema";
import {
  AI_ENGINES,
  aiRunStatus,
  aiObservationStatus,
} from "@/shared/ai-visibility";

export const aiVisibilitySettings = pgTable("ai_visibility_settings", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  brandName: text("brand_name").notNull(),
  domain: text("domain").notNull(),
  chatgpt: boolean("chatgpt").notNull(),
  gemini: boolean("gemini").notNull(),
  googleAiOverview: boolean("google_ai_overview").notNull(),
});
export const aiVisibilityPrompts = pgTable(
  "ai_visibility_prompts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    createdAt: text("created_at").notNull(),
    archivedAt: text("archived_at"),
  },
  (t) => [index("ai_visibility_prompts_project_idx").on(t.projectId)],
);
export const aiVisibilityRuns = pgTable(
  "ai_visibility_runs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: text("status", { enum: aiRunStatus }).notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    estimatedCostUsd: real("estimated_cost_usd").notNull(),
    createdAt: text("created_at").notNull(),
    finishedAt: text("finished_at"),
  },
  (t) => [
    index("ai_visibility_runs_project_idx").on(t.projectId, t.createdAt),
    uniqueIndex("ai_visibility_runs_one_active_idx")
      .on(t.projectId)
      .where(sql`${t.status} IN ('queued', 'running')`),
  ],
);
export const aiVisibilityRunBrands = pgTable(
  "ai_visibility_run_brands",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => aiVisibilityRuns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    isOwn: boolean("is_own").notNull(),
  },
  (t) => [index("ai_visibility_run_brands_run_idx").on(t.runId)],
);
export const aiVisibilityObservations = pgTable(
  "ai_visibility_observations",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => aiVisibilityRuns.id, { onDelete: "cascade" }),
    promptId: text("prompt_id")
      .notNull()
      .references(() => aiVisibilityPrompts.id, { onDelete: "cascade" }),
    engine: text("engine", { enum: AI_ENGINES }).notNull(),
    status: text("status", { enum: aiObservationStatus }).notNull(),
    answer: text("answer"),
    error: text("error"),
    collectedAt: text("collected_at"),
  },
  (t) => [
    uniqueIndex("ai_visibility_observations_pair_idx").on(
      t.runId,
      t.promptId,
      t.engine,
    ),
  ],
);
export const aiVisibilityCitations = pgTable(
  "ai_visibility_citations",
  {
    id: text("id").primaryKey(),
    observationId: text("observation_id")
      .notNull()
      .references(() => aiVisibilityObservations.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    domain: text("domain").notNull(),
    title: text("title"),
    position: integer("position").notNull(),
  },
  (t) => [index("ai_visibility_citations_observation_idx").on(t.observationId)],
);
export const aiVisibilityMentions = pgTable(
  "ai_visibility_mentions",
  {
    id: text("id").primaryKey(),
    observationId: text("observation_id")
      .notNull()
      .references(() => aiVisibilityObservations.id, { onDelete: "cascade" }),
    brandId: text("brand_id")
      .notNull()
      .references(() => aiVisibilityRunBrands.id, { onDelete: "cascade" }),
    mentioned: boolean("mentioned").notNull(),
    cited: boolean("cited").notNull(),
  },
  (t) => [
    uniqueIndex("ai_visibility_mentions_pair_idx").on(
      t.observationId,
      t.brandId,
    ),
  ],
);
