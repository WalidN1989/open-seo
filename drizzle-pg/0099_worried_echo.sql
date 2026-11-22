CREATE TABLE "rank_check_run_targets" (
	"run_id" text NOT NULL,
	"tracking_keyword_id" text NOT NULL,
	"keyword" text NOT NULL,
	"device" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rank_check_runs" ADD COLUMN "targets_prepared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rank_check_run_targets" ADD CONSTRAINT "rank_check_run_targets_run_id_rank_check_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."rank_check_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rank_check_run_targets_run_keyword_device_idx" ON "rank_check_run_targets" USING btree ("run_id","tracking_keyword_id","device");