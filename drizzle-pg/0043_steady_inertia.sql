ALTER TABLE "projects" ADD COLUMN "slug" text;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_slug_uidx" ON "projects" USING btree ("slug");