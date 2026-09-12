CREATE TABLE "project_search_history" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"module" text NOT NULL,
	"item_key" text NOT NULL,
	"item_json" text NOT NULL,
	"ran_by_user_id" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_search_history" ADD CONSTRAINT "project_search_history_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_search_history_unique_entry" ON "project_search_history" USING btree ("project_id","module","item_key");--> statement-breakpoint
CREATE INDEX "project_search_history_recent_idx" ON "project_search_history" USING btree ("project_id","module","created_at");