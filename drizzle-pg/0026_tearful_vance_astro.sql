CREATE TABLE "business_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"metadata_json" text DEFAULT '{}' NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_audit_events" ADD CONSTRAINT "business_audit_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_audit_events_org_created_idx" ON "business_audit_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "business_audit_events_actor_idx" ON "business_audit_events" USING btree ("actor_user_id");