CREATE TABLE "ai_visibility_citations" (
	"id" text PRIMARY KEY NOT NULL,
	"observation_id" text NOT NULL,
	"url" text NOT NULL,
	"domain" text NOT NULL,
	"title" text,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_visibility_mentions" (
	"id" text PRIMARY KEY NOT NULL,
	"observation_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"mentioned" boolean NOT NULL,
	"cited" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_visibility_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"prompt_id" text NOT NULL,
	"engine" text NOT NULL,
	"status" text NOT NULL,
	"answer" text,
	"error" text,
	"collected_at" text
);
--> statement-breakpoint
CREATE TABLE "ai_visibility_prompts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"text" text NOT NULL,
	"created_at" text NOT NULL,
	"archived_at" text
);
--> statement-breakpoint
CREATE TABLE "ai_visibility_run_brands" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"is_own" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_visibility_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"status" text NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"estimated_cost_usd" real NOT NULL,
	"created_at" text NOT NULL,
	"finished_at" text
);
--> statement-breakpoint
CREATE TABLE "ai_visibility_settings" (
	"project_id" text PRIMARY KEY NOT NULL,
	"brand_name" text NOT NULL,
	"domain" text NOT NULL,
	"chatgpt" boolean NOT NULL,
	"gemini" boolean NOT NULL,
	"google_ai_overview" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_visibility_citations" ADD CONSTRAINT "ai_visibility_citations_observation_id_ai_visibility_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."ai_visibility_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_mentions" ADD CONSTRAINT "ai_visibility_mentions_observation_id_ai_visibility_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."ai_visibility_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_mentions" ADD CONSTRAINT "ai_visibility_mentions_brand_id_ai_visibility_run_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."ai_visibility_run_brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_observations" ADD CONSTRAINT "ai_visibility_observations_run_id_ai_visibility_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_visibility_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_observations" ADD CONSTRAINT "ai_visibility_observations_prompt_id_ai_visibility_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."ai_visibility_prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_prompts" ADD CONSTRAINT "ai_visibility_prompts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_run_brands" ADD CONSTRAINT "ai_visibility_run_brands_run_id_ai_visibility_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_visibility_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_runs" ADD CONSTRAINT "ai_visibility_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_settings" ADD CONSTRAINT "ai_visibility_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_visibility_citations_observation_idx" ON "ai_visibility_citations" USING btree ("observation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_visibility_mentions_pair_idx" ON "ai_visibility_mentions" USING btree ("observation_id","brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_visibility_observations_pair_idx" ON "ai_visibility_observations" USING btree ("run_id","prompt_id","engine");--> statement-breakpoint
CREATE INDEX "ai_visibility_prompts_project_idx" ON "ai_visibility_prompts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ai_visibility_run_brands_run_idx" ON "ai_visibility_run_brands" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "ai_visibility_runs_project_idx" ON "ai_visibility_runs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_visibility_runs_one_active_idx" ON "ai_visibility_runs" USING btree ("project_id") WHERE "ai_visibility_runs"."status" IN ('queued', 'running');