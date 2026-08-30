CREATE TABLE "crm_source_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"run_id" text NOT NULL,
	"external_id" text NOT NULL,
	"provider" text NOT NULL,
	"company_name" text NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"website" text,
	"category" text,
	"country" text,
	"industry" text,
	"rating" integer,
	"review_count" integer,
	"evidence_score" integer DEFAULT 0 NOT NULL,
	"profile_url" text,
	"notes" text,
	"status" text DEFAULT 'new' NOT NULL,
	"rejected_reason" text,
	"lead_id" text,
	"reviewed_by_member_id" text,
	"reviewed_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_source_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"query" text NOT NULL,
	"location" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"candidate_count" integer DEFAULT 0 NOT NULL,
	"promoted_count" integer DEFAULT 0 NOT NULL,
	"started_by_member_id" text,
	"completed_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_source_candidates" ADD CONSTRAINT "crm_source_candidates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_source_candidates" ADD CONSTRAINT "crm_source_candidates_run_id_crm_source_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."crm_source_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_source_candidates" ADD CONSTRAINT "crm_source_candidates_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_source_candidates" ADD CONSTRAINT "crm_source_candidates_reviewed_by_member_id_member_id_fk" FOREIGN KEY ("reviewed_by_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_source_runs" ADD CONSTRAINT "crm_source_runs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_source_runs" ADD CONSTRAINT "crm_source_runs_started_by_member_id_member_id_fk" FOREIGN KEY ("started_by_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_source_candidates_org_status_idx" ON "crm_source_candidates" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_source_candidates_org_provider_external_idx" ON "crm_source_candidates" USING btree ("organization_id","provider","external_id");--> statement-breakpoint
CREATE INDEX "crm_source_runs_org_created_idx" ON "crm_source_runs" USING btree ("organization_id","created_at");