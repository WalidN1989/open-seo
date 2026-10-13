CREATE TABLE "commerce_order_gap_annotations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"order_number" text NOT NULL,
	"marked_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commerce_order_gap_annotations" ADD CONSTRAINT "commerce_order_gap_annotations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_order_gap_annotations_org_number_idx" ON "commerce_order_gap_annotations" USING btree ("organization_id","order_number");