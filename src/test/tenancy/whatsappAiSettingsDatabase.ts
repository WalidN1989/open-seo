import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";

/** Minimal synthetic fixture using the real settings CREATE migration. */
export async function createWhatsappAiSettingsDatabase(
  execute: (statement: string) => Promise<unknown>,
  dialect: "sqlite" | "postgres",
) {
  await execute("CREATE TABLE organization (id text PRIMARY KEY, name text)");
  await execute(
    "INSERT INTO organization VALUES ('a','Workspace A'),('b','Workspace B')",
  );
  const file =
    dialect === "sqlite"
      ? "drizzle/0065_hot_thunderbolts.sql"
      : "drizzle-pg/0044_regular_oracle.sql";
  const table =
    dialect === "sqlite"
      ? "`whatsapp_assistant_settings`"
      : '"whatsapp_assistant_settings"';
  const create = readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .find((statement) => statement.includes(`CREATE TABLE ${table}`));
  if (!create) throw new Error("Missing assistant settings migration");
  await execute(create);
  for (const column of [
    "contact_email",
    "contact_phone",
    "address",
    "handoff_content_sid",
  ]) {
    await execute(
      `ALTER TABLE whatsapp_assistant_settings ADD COLUMN ${column} text`,
    );
  }
  await execute(
    "CREATE TABLE business_audit_events (id text PRIMARY KEY, organization_id text NOT NULL, actor_user_id text NOT NULL, action text NOT NULL, target_type text NOT NULL, target_id text, metadata_json text NOT NULL DEFAULT '{}', created_at text NOT NULL DEFAULT current_timestamp)",
  );
}

export function createWhatsappAiSettingsTestClient() {
  const path = join(tmpdir(), `du-ai-settings-${crypto.randomUUID()}.sqlite`);
  const client = createClient({ url: `file:${path}` });
  return {
    client,
    close: () => {
      client.close();
      rmSync(path, { force: true });
    },
  };
}
