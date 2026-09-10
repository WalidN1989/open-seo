CREATE TABLE "serp_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"keyword" text NOT NULL,
	"location_code" integer NOT NULL,
	"domain" text NOT NULL,
	"rank" integer NOT NULL,
	"referring_domains" integer,
	"seen_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "serp_observations" ADD CONSTRAINT "serp_observations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "serp_observations_unique_project_keyword_domain" ON "serp_observations" USING btree ("project_id","keyword","location_code","domain");--> statement-breakpoint
CREATE INDEX "serp_observations_project_idx" ON "serp_observations" USING btree ("project_id","domain");