import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { organization, user } from "./better-auth-schema";
import { projects } from "./app.schema";

// Optimizations: a review queue for content work. An agent proposes through
// MCP, a person approves in the browser, and only then may an adapter write to
// a CMS. See docs/OPTIMIZATIONS_MODULE.md.
//
// Snapshots are stored as text rather than a JSON column so both dialects hold
// the same shape, matching how audit pages store their structured fields.
export const optimizationOpportunities = sqliteTable(
  "optimization_opportunities",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** product | blog | page */
    type: text("type").notNull(),
    keyword: text("keyword").notNull(),
    /** The URL to improve, when recommendedAction is optimize_existing. */
    targetUrl: text("target_url"),
    /** The path to create, when recommendedAction is create_new. */
    proposedPath: text("proposed_path"),
    /** gsc_striking_distance | keyword_research | rank_drop | manual */
    source: text("source").notNull(),
    score: integer("score").notNull().default(0),
    // The evidence the Why tab renders. Nothing is shown that is not in here,
    // so an opportunity can never display a metric nobody measured.
    gscSnapshotJson: text("gsc_snapshot_json"),
    serpSnapshotJson: text("serp_snapshot_json"),
    strengths: text("strengths"),
    weaknesses: text("weaknesses"),
    /** optimize_existing | create_new */
    recommendedAction: text("recommended_action").notNull(),
    briefJson: text("brief_json"),
    draftJson: text("draft_json"),
    draftVersion: integer("draft_version").notNull().default(0),
    /** wordpress | shopify | manual */
    cms: text("cms").notNull().default("manual"),
    cmsTargetJson: text("cms_target_json"),
    status: text("status").notNull().default("detected"),
    /** agent | user */
    createdBy: text("created_by").notNull().default("user"),
    creditsUsed: integer("credits_used").notNull().default(0),
    approvedByUserId: text("approved_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    approvedAt: text("approved_at"),
    publishedAt: text("published_at"),
    publishError: text("publish_error"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("optimization_opportunities_project_status_idx").on(
      table.projectId,
      table.status,
    ),
    // The upsert key. Not unique: a published or rejected row is history, and
    // the same keyword may legitimately come round again later.
    index("optimization_opportunities_dedupe_idx").on(
      table.projectId,
      table.type,
      table.keyword,
    ),
  ],
);

export const optimizationRevisions = sqliteTable(
  "optimization_revisions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => optimizationOpportunities.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    draftJson: text("draft_json").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("optimization_revisions_opportunity_version_idx").on(
      table.opportunityId,
      table.version,
    ),
  ],
);

export const optimizationComments = sqliteTable(
  "optimization_comments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => optimizationOpportunities.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    /** agent | user | system */
    authorRole: text("author_role").notNull(),
    // user is something a person or the assistant wrote; system is the thread
    // recording that something happened, like a new draft arriving.
    kind: text("kind").notNull().default("user"),
    body: text("body").notNull(),
    // client comments are the conversation the reviewer sees; internal ones are
    // working notes. An MCP-written comment defaults to internal, so the agent
    // has to opt in to address the client.
    visibility: text("visibility").notNull().default("internal"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("optimization_comments_opportunity_idx").on(
      table.opportunityId,
      table.createdAt,
    ),
  ],
);
