CREATE TABLE "optimization_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"opportunity_id" text NOT NULL,
	"author_user_id" text,
	"author_role" text NOT NULL,
	"body" text NOT NULL,
	"visibility" text DEFAULT 'internal' NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimization_opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"type" text NOT NULL,
	"keyword" text NOT NULL,
	"target_url" text,
	"proposed_path" text,
	"source" text NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"gsc_snapshot_json" text,
	"serp_snapshot_json" text,
	"strengths" text,
	"weaknesses" text,
	"recommended_action" text NOT NULL,
	"brief_json" text,
	"draft_json" text,
	"draft_version" integer DEFAULT 0 NOT NULL,
	"cms" text DEFAULT 'manual' NOT NULL,
	"cms_target_json" text,
	"status" text DEFAULT 'detected' NOT NULL,
	"created_by" text DEFAULT 'user' NOT NULL,
	"credits_used" integer DEFAULT 0 NOT NULL,
	"approved_by_user_id" text,
	"approved_at" text,
	"published_at" text,
	"publish_error" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimization_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"opportunity_id" text NOT NULL,
	"version" integer NOT NULL,
	"draft_json" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "optimization_comments" ADD CONSTRAINT "optimization_comments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_comments" ADD CONSTRAINT "optimization_comments_opportunity_id_optimization_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."optimization_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_comments" ADD CONSTRAINT "optimization_comments_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_opportunities" ADD CONSTRAINT "optimization_opportunities_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_opportunities" ADD CONSTRAINT "optimization_opportunities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_opportunities" ADD CONSTRAINT "optimization_opportunities_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_revisions" ADD CONSTRAINT "optimization_revisions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_revisions" ADD CONSTRAINT "optimization_revisions_opportunity_id_optimization_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."optimization_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "optimization_comments_opportunity_idx" ON "optimization_comments" USING btree ("opportunity_id","created_at");--> statement-breakpoint
CREATE INDEX "optimization_opportunities_project_status_idx" ON "optimization_opportunities" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "optimization_opportunities_dedupe_idx" ON "optimization_opportunities" USING btree ("project_id","type","keyword");--> statement-breakpoint
CREATE UNIQUE INDEX "optimization_revisions_opportunity_version_idx" ON "optimization_revisions" USING btree ("opportunity_id","version");