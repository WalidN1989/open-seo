CREATE TABLE "voice_agent_lessons" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"agent_config_id" text NOT NULL,
	"kind" text NOT NULL,
	"lesson" text NOT NULL,
	"seen_count" integer DEFAULT 1 NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_agent_configs" ADD COLUMN "last_learned_at" text;--> statement-breakpoint
ALTER TABLE "voice_agent_lessons" ADD CONSTRAINT "voice_agent_lessons_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_agent_lessons" ADD CONSTRAINT "voice_agent_lessons_agent_config_id_voice_agent_configs_id_fk" FOREIGN KEY ("agent_config_id") REFERENCES "public"."voice_agent_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "voice_agent_lessons_agent_rank_idx" ON "voice_agent_lessons" USING btree ("organization_id","agent_config_id","seen_count");