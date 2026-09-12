CREATE TABLE "research_purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"user_id" text,
	"endpoint" text NOT NULL,
	"credit_feature" text,
	"input_json" text,
	"outcome" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "research_purchases" ADD CONSTRAINT "research_purchases_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_purchases_org_created_idx" ON "research_purchases" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "research_purchases_project_idx" ON "research_purchases" USING btree ("project_id","endpoint");