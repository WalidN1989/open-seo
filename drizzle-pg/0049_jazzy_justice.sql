CREATE TABLE "invoice_line_items" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"detail" text,
	"quantity_milli" integer DEFAULT 1000 NOT NULL,
	"unit_price_minor" integer DEFAULT 0 NOT NULL,
	"amount_minor" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"legal_name" text DEFAULT '' NOT NULL,
	"address_lines" text DEFAULT '' NOT NULL,
	"email" text,
	"phone" text,
	"website" text,
	"tax_id_label" text,
	"tax_id_value" text,
	"tax_registered" boolean DEFAULT false NOT NULL,
	"tax_label" text,
	"tax_rate_percent" integer DEFAULT 0 NOT NULL,
	"tax_note" text,
	"default_currency" text DEFAULT 'AUD' NOT NULL,
	"payment_terms_days" integer DEFAULT 14 NOT NULL,
	"payment_instructions" text,
	"bank_details" text,
	"footer_note" text,
	"logo_url" text,
	"invoice_prefix" text DEFAULT 'INV' NOT NULL,
	"next_invoice_number" integer DEFAULT 1 NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"number" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"document_type" text DEFAULT 'invoice' NOT NULL,
	"client_name" text NOT NULL,
	"client_address_lines" text,
	"client_email" text,
	"client_tax_id_label" text,
	"client_tax_id_value" text,
	"currency" text DEFAULT 'AUD' NOT NULL,
	"issue_date" text NOT NULL,
	"due_date" text NOT NULL,
	"service_period" text,
	"notes" text,
	"tax_label" text,
	"tax_rate_percent" integer DEFAULT 0 NOT NULL,
	"subtotal_minor" integer DEFAULT 0 NOT NULL,
	"tax_minor" integer DEFAULT 0 NOT NULL,
	"total_minor" integer DEFAULT 0 NOT NULL,
	"issuer_snapshot_json" text,
	"sent_at" text,
	"paid_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_settings" ADD CONSTRAINT "invoice_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_line_items_invoice_idx" ON "invoice_line_items" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_organization_number_idx" ON "invoices" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "invoices_organization_status_idx" ON "invoices" USING btree ("organization_id","status");