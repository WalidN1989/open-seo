CREATE TABLE "quote_line_items" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"quote_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"product_id" text,
	"description" text NOT NULL,
	"detail" text,
	"quantity_milli" integer DEFAULT 1000 NOT NULL,
	"unit_price_minor" integer DEFAULT 0 NOT NULL,
	"amount_minor" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"number" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"lead_id" text,
	"contact_id" text,
	"company_id" text,
	"title" text,
	"client_name" text NOT NULL,
	"client_address_lines" text,
	"client_email" text,
	"client_tax_id_label" text,
	"client_tax_id_value" text,
	"currency" text DEFAULT 'AUD' NOT NULL,
	"issue_date" text NOT NULL,
	"valid_until" text NOT NULL,
	"notes" text,
	"terms" text,
	"tax_label" text,
	"tax_rate_percent" integer DEFAULT 0 NOT NULL,
	"subtotal_minor" integer DEFAULT 0 NOT NULL,
	"tax_minor" integer DEFAULT 0 NOT NULL,
	"total_minor" integer DEFAULT 0 NOT NULL,
	"issuer_snapshot_json" text,
	"sent_at" text,
	"responded_at" text,
	"converted_invoice_id" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commerce_products" ADD COLUMN "item_type" text DEFAULT 'product' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_settings" ADD COLUMN "quote_prefix" text DEFAULT 'QUO' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_settings" ADD COLUMN "next_quote_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_settings" ADD COLUMN "quote_validity_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_settings" ADD COLUMN "quote_terms" text;--> statement-breakpoint
ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_product_id_commerce_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."commerce_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_converted_invoice_id_invoices_id_fk" FOREIGN KEY ("converted_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quote_line_items_quote_idx" ON "quote_line_items" USING btree ("quote_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_organization_number_idx" ON "quotes" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "quotes_organization_status_idx" ON "quotes" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "quotes_lead_idx" ON "quotes" USING btree ("lead_id");