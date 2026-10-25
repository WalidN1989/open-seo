CREATE TABLE "attention_heads" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attention_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"entity_id" text NOT NULL,
	"revision" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_case_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"case_id" text NOT NULL,
	"external_conversation_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_number" text,
	"contact_id" text,
	"lead_id" text,
	"source_call_id" text,
	"whatsapp_conversation_id" text,
	"sms_conversation_id" text,
	"order_id" text,
	"order_or_tracking_number" text,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"call_attempts" integer DEFAULT 0 NOT NULL,
	"reminder_count" integer DEFAULT 0 NOT NULL,
	"last_contact_time" text,
	"last_outcome" text,
	"notes" text,
	"ready_to_close" boolean DEFAULT false NOT NULL,
	"ready_reason" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"closed_at" text
);
--> statement-breakpoint
CREATE TABLE "voice_outbound_policies" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"callee_name" text DEFAULT 'Umi' NOT NULL,
	"timezone" text DEFAULT 'Asia/Colombo' NOT NULL,
	"window_start" text DEFAULT '08:00' NOT NULL,
	"window_end" text DEFAULT '22:00' NOT NULL,
	"customer_gap_hours" integer DEFAULT 4 NOT NULL,
	"daily_call_limit" integer DEFAULT 5 NOT NULL,
	"no_answer_retry_minutes" integer DEFAULT 30 NOT NULL,
	"no_answer_retries" integer DEFAULT 1 NOT NULL,
	"max_reminders" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_phone_calls" ADD COLUMN "recording_url" text;--> statement-breakpoint
ALTER TABLE "attention_heads" ADD CONSTRAINT "attention_heads_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attention_sources" ADD CONSTRAINT "attention_sources_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_case_calls" ADD CONSTRAINT "voice_case_calls_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_case_calls" ADD CONSTRAINT "voice_case_calls_case_id_voice_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."voice_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_cases" ADD CONSTRAINT "voice_cases_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_cases" ADD CONSTRAINT "voice_cases_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_cases" ADD CONSTRAINT "voice_cases_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_cases" ADD CONSTRAINT "voice_cases_source_call_id_voice_phone_calls_id_fk" FOREIGN KEY ("source_call_id") REFERENCES "public"."voice_phone_calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_cases" ADD CONSTRAINT "voice_cases_whatsapp_conversation_id_whatsapp_conversations_id_fk" FOREIGN KEY ("whatsapp_conversation_id") REFERENCES "public"."whatsapp_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_cases" ADD CONSTRAINT "voice_cases_sms_conversation_id_sms_conversations_id_fk" FOREIGN KEY ("sms_conversation_id") REFERENCES "public"."sms_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_cases" ADD CONSTRAINT "voice_cases_order_id_commerce_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."commerce_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_outbound_policies" ADD CONSTRAINT "voice_outbound_policies_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attention_sources_org_kind_entity_idx" ON "attention_sources" USING btree ("organization_id","kind","entity_id");--> statement-breakpoint
CREATE INDEX "attention_sources_org_revision_idx" ON "attention_sources" USING btree ("organization_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_case_calls_org_external_idx" ON "voice_case_calls" USING btree ("organization_id","external_conversation_id");--> statement-breakpoint
CREATE INDEX "voice_case_calls_case_idx" ON "voice_case_calls" USING btree ("organization_id","case_id");--> statement-breakpoint
CREATE INDEX "voice_cases_org_status_idx" ON "voice_cases" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "voice_cases_org_updated_idx" ON "voice_cases" USING btree ("organization_id","updated_at");
--> statement-breakpoint
INSERT INTO attention_sources (id,organization_id,kind,entity_id,revision) SELECT kind || ':' || entity_id,organization_id,kind,entity_id,row_number() OVER (PARTITION BY organization_id ORDER BY kind,entity_id) FROM (SELECT organization_id,'call' AS kind,id AS entity_id FROM voice_phone_calls UNION ALL SELECT organization_id,'whatsapp' AS kind,id AS entity_id FROM whatsapp_conversations UNION ALL SELECT organization_id,'sms' AS kind,id AS entity_id FROM sms_conversations UNION ALL SELECT organization_id,'case' AS kind,id AS entity_id FROM voice_cases) seed;
--> statement-breakpoint
INSERT INTO attention_heads (organization_id,revision) SELECT organization_id,max(revision) FROM attention_sources GROUP BY organization_id;
--> statement-breakpoint
INSERT INTO voice_outbound_policies (organization_id) SELECT id FROM organization ON CONFLICT (organization_id) DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION attention_call_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
INSERT INTO attention_heads (organization_id,revision) VALUES (NEW.organization_id,1)
ON CONFLICT (organization_id) DO UPDATE SET revision=attention_heads.revision+1;
INSERT INTO attention_sources (id,organization_id,kind,entity_id,revision)
VALUES ('call:' || NEW.id,NEW.organization_id,'call',NEW.id,(SELECT revision FROM attention_heads WHERE organization_id=NEW.organization_id))
ON CONFLICT (organization_id,kind,entity_id) DO UPDATE SET revision=excluded.revision;
RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER attention_call AFTER INSERT OR UPDATE ON voice_phone_calls FOR EACH ROW EXECUTE FUNCTION attention_call_fn();
--> statement-breakpoint
CREATE FUNCTION attention_whatsapp_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
INSERT INTO attention_heads (organization_id,revision) VALUES (NEW.organization_id,1)
ON CONFLICT (organization_id) DO UPDATE SET revision=attention_heads.revision+1;
INSERT INTO attention_sources (id,organization_id,kind,entity_id,revision)
VALUES ('whatsapp:' || NEW.id,NEW.organization_id,'whatsapp',NEW.id,(SELECT revision FROM attention_heads WHERE organization_id=NEW.organization_id))
ON CONFLICT (organization_id,kind,entity_id) DO UPDATE SET revision=excluded.revision;
RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER attention_whatsapp AFTER INSERT OR UPDATE ON whatsapp_conversations FOR EACH ROW EXECUTE FUNCTION attention_whatsapp_fn();
--> statement-breakpoint
CREATE FUNCTION attention_sms_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
INSERT INTO attention_heads (organization_id,revision) VALUES (NEW.organization_id,1)
ON CONFLICT (organization_id) DO UPDATE SET revision=attention_heads.revision+1;
INSERT INTO attention_sources (id,organization_id,kind,entity_id,revision)
VALUES ('sms:' || NEW.id,NEW.organization_id,'sms',NEW.id,(SELECT revision FROM attention_heads WHERE organization_id=NEW.organization_id))
ON CONFLICT (organization_id,kind,entity_id) DO UPDATE SET revision=excluded.revision;
RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER attention_sms AFTER INSERT OR UPDATE ON sms_conversations FOR EACH ROW EXECUTE FUNCTION attention_sms_fn();
--> statement-breakpoint
CREATE FUNCTION attention_case_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
INSERT INTO attention_heads (organization_id,revision) VALUES (NEW.organization_id,1)
ON CONFLICT (organization_id) DO UPDATE SET revision=attention_heads.revision+1;
INSERT INTO attention_sources (id,organization_id,kind,entity_id,revision)
VALUES ('case:' || NEW.id,NEW.organization_id,'case',NEW.id,(SELECT revision FROM attention_heads WHERE organization_id=NEW.organization_id))
ON CONFLICT (organization_id,kind,entity_id) DO UPDATE SET revision=excluded.revision;
RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER attention_case AFTER INSERT OR UPDATE ON voice_cases FOR EACH ROW EXECUTE FUNCTION attention_case_fn();
--> statement-breakpoint
CREATE FUNCTION attention_whatsapp_message_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
INSERT INTO attention_heads (organization_id,revision) VALUES (NEW.organization_id,1)
ON CONFLICT (organization_id) DO UPDATE SET revision=attention_heads.revision+1;
INSERT INTO attention_sources (id,organization_id,kind,entity_id,revision)
VALUES ('whatsapp:' || NEW.conversation_id,NEW.organization_id,'whatsapp',NEW.conversation_id,(SELECT revision FROM attention_heads WHERE organization_id=NEW.organization_id))
ON CONFLICT (organization_id,kind,entity_id) DO UPDATE SET revision=excluded.revision;
RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER attention_whatsapp_message AFTER INSERT OR UPDATE ON whatsapp_messages FOR EACH ROW EXECUTE FUNCTION attention_whatsapp_message_fn();
--> statement-breakpoint
CREATE FUNCTION attention_sms_message_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
INSERT INTO attention_heads (organization_id,revision) VALUES (NEW.organization_id,1)
ON CONFLICT (organization_id) DO UPDATE SET revision=attention_heads.revision+1;
INSERT INTO attention_sources (id,organization_id,kind,entity_id,revision)
VALUES ('sms:' || NEW.conversation_id,NEW.organization_id,'sms',NEW.conversation_id,(SELECT revision FROM attention_heads WHERE organization_id=NEW.organization_id))
ON CONFLICT (organization_id,kind,entity_id) DO UPDATE SET revision=excluded.revision;
RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER attention_sms_message AFTER INSERT OR UPDATE ON sms_messages FOR EACH ROW EXECUTE FUNCTION attention_sms_message_fn();
--> statement-breakpoint
CREATE FUNCTION case_whatsapp_changed_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
IF NEW.reply_mode <> OLD.reply_mode OR (NEW.status IN ('resolved','closed') AND OLD.status NOT IN ('resolved','closed')) THEN
INSERT INTO attention_heads (organization_id,revision) VALUES (NEW.organization_id,0) ON CONFLICT (organization_id) DO UPDATE SET revision=attention_heads.revision;
UPDATE voice_cases SET ready_to_close=true,ready_reason='Chat mode or resolution changed',updated_at=to_char(clock_timestamp() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE organization_id=NEW.organization_id AND status <> 'closed' AND ready_to_close=false AND (whatsapp_conversation_id=NEW.id);
END IF;
RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER case_whatsapp_changed AFTER UPDATE ON whatsapp_conversations FOR EACH ROW EXECUTE FUNCTION case_whatsapp_changed_fn();
--> statement-breakpoint
CREATE FUNCTION case_crm_contacts_changed_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
IF NEW.updated_at <> OLD.updated_at THEN
INSERT INTO attention_heads (organization_id,revision) VALUES (NEW.organization_id,0) ON CONFLICT (organization_id) DO UPDATE SET revision=attention_heads.revision;
UPDATE voice_cases SET ready_to_close=true,ready_reason='CRM contact updated',updated_at=to_char(clock_timestamp() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE organization_id=NEW.organization_id AND status <> 'closed' AND ready_to_close=false AND (contact_id=NEW.id OR whatsapp_conversation_id IN (SELECT id FROM whatsapp_conversations WHERE organization_id=NEW.organization_id AND contact_id=NEW.id) OR sms_conversation_id IN (SELECT id FROM sms_conversations WHERE organization_id=NEW.organization_id AND contact_id=NEW.id) OR source_call_id IN (SELECT id FROM voice_phone_calls WHERE organization_id=NEW.organization_id AND contact_id=NEW.id));
END IF;
RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER case_crm_contacts_changed AFTER UPDATE ON crm_contacts FOR EACH ROW EXECUTE FUNCTION case_crm_contacts_changed_fn();
--> statement-breakpoint
CREATE FUNCTION case_crm_leads_changed_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
IF NEW.updated_at <> OLD.updated_at THEN
INSERT INTO attention_heads (organization_id,revision) VALUES (NEW.organization_id,0) ON CONFLICT (organization_id) DO UPDATE SET revision=attention_heads.revision;
UPDATE voice_cases SET ready_to_close=true,ready_reason='CRM lead updated',updated_at=to_char(clock_timestamp() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE organization_id=NEW.organization_id AND status <> 'closed' AND ready_to_close=false AND (lead_id=NEW.id OR source_call_id IN (SELECT id FROM voice_phone_calls WHERE organization_id=NEW.organization_id AND lead_id=NEW.id));
END IF;
RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER case_crm_leads_changed AFTER UPDATE ON crm_leads FOR EACH ROW EXECUTE FUNCTION case_crm_leads_changed_fn();
--> statement-breakpoint
CREATE FUNCTION case_commerce_orders_changed_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
IF NEW.updated_at <> OLD.updated_at THEN
INSERT INTO attention_heads (organization_id,revision) VALUES (NEW.organization_id,0) ON CONFLICT (organization_id) DO UPDATE SET revision=attention_heads.revision;
UPDATE voice_cases SET ready_to_close=true,ready_reason='Order updated',updated_at=to_char(clock_timestamp() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE organization_id=NEW.organization_id AND status <> 'closed' AND ready_to_close=false AND (order_id=NEW.id);
END IF;
RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER case_commerce_orders_changed AFTER UPDATE ON commerce_orders FOR EACH ROW EXECUTE FUNCTION case_commerce_orders_changed_fn();
--> statement-breakpoint
CREATE FUNCTION case_human_whatsapp_reply_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
IF NEW.action='whatsapp.message.sent' THEN
INSERT INTO attention_heads (organization_id,revision) VALUES (NEW.organization_id,0) ON CONFLICT (organization_id) DO UPDATE SET revision=attention_heads.revision;
UPDATE voice_cases SET ready_to_close=true,ready_reason='Human WhatsApp reply',updated_at=to_char(clock_timestamp() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE organization_id=NEW.organization_id AND status <> 'closed' AND ready_to_close=false AND (whatsapp_conversation_id IN (SELECT conversation_id FROM whatsapp_messages WHERE id=NEW.target_id AND organization_id=NEW.organization_id AND direction='outbound' AND status NOT IN ('failed','queued','sending')));
END IF;
RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER case_human_whatsapp_reply AFTER INSERT ON business_audit_events FOR EACH ROW EXECUTE FUNCTION case_human_whatsapp_reply_fn();
--> statement-breakpoint
CREATE FUNCTION case_human_whatsapp_delivery_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
IF NEW.direction='outbound' AND NEW.status IN ('sent','delivered','read') AND OLD.status NOT IN ('sent','delivered','read') AND EXISTS (SELECT 1 FROM business_audit_events WHERE organization_id=NEW.organization_id AND target_id=NEW.id AND action='whatsapp.message.sent') THEN
INSERT INTO attention_heads (organization_id,revision) VALUES (NEW.organization_id,0) ON CONFLICT (organization_id) DO UPDATE SET revision=attention_heads.revision;
UPDATE voice_cases SET ready_to_close=true,ready_reason='Human WhatsApp reply',updated_at=to_char(clock_timestamp() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE organization_id=NEW.organization_id AND status <> 'closed' AND ready_to_close=false AND (whatsapp_conversation_id=NEW.conversation_id);
END IF;
RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER case_human_whatsapp_delivery AFTER UPDATE ON whatsapp_messages FOR EACH ROW EXECUTE FUNCTION case_human_whatsapp_delivery_fn();
--> statement-breakpoint
CREATE FUNCTION case_human_sms_reply_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
IF NEW.direction='outbound' AND NEW.authored_by IS NOT NULL AND NEW.status NOT IN ('failed','queued','sending') THEN
INSERT INTO attention_heads (organization_id,revision) VALUES (NEW.organization_id,0) ON CONFLICT (organization_id) DO UPDATE SET revision=attention_heads.revision;
UPDATE voice_cases SET ready_to_close=true,ready_reason='Human SMS reply',updated_at=to_char(clock_timestamp() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE organization_id=NEW.organization_id AND status <> 'closed' AND ready_to_close=false AND (sms_conversation_id=NEW.conversation_id);
END IF;
RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER case_human_sms_reply AFTER INSERT OR UPDATE ON sms_messages FOR EACH ROW EXECUTE FUNCTION case_human_sms_reply_fn();
--> statement-breakpoint
CREATE FUNCTION case_call_linked_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
INSERT INTO attention_heads (organization_id,revision) VALUES (NEW.organization_id,0) ON CONFLICT (organization_id) DO UPDATE SET revision=attention_heads.revision;
UPDATE voice_cases SET updated_at=to_char(clock_timestamp() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE organization_id=NEW.organization_id AND id=NEW.case_id;
RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER case_call_linked AFTER INSERT ON voice_case_calls FOR EACH ROW EXECUTE FUNCTION case_call_linked_fn();
--> statement-breakpoint
CREATE FUNCTION case_policy_defaults_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
INSERT INTO voice_outbound_policies (organization_id) VALUES (NEW.id) ON CONFLICT (organization_id) DO NOTHING;
RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER case_policy_defaults AFTER INSERT ON organization FOR EACH ROW EXECUTE FUNCTION case_policy_defaults_fn();
