CREATE TABLE "research_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"html" text NOT NULL,
	"skill" text,
	"template_id" text,
	"created_by" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"share_token" text,
	"shared_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"instructions" text NOT NULL,
	"created_by" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "research_reports" ADD CONSTRAINT "research_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "research_reports_project_title_idx" ON "research_reports" USING btree ("project_id","title");--> statement-breakpoint
CREATE INDEX "research_reports_project_updated_idx" ON "research_reports" USING btree ("project_id","updated_at","id","size_bytes");--> statement-breakpoint
CREATE UNIQUE INDEX "research_reports_share_token_idx" ON "research_reports" USING btree ("share_token");--> statement-breakpoint
CREATE UNIQUE INDEX "report_templates_project_name_idx" ON "report_templates" USING btree ("project_id","name");