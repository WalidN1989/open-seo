import { readFileSync } from "node:fs";
import type { Client } from "@libsql/client";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import * as schema from "@/db/business.schema";

export async function createCaseTestDatabase(client: Client) {
  await client.execute("CREATE TABLE organization (id text primary key)");
  await client.execute("INSERT INTO organization (id) VALUES ('a'),('b')");
  for (const table of [
    schema.voicePhoneCalls,
    schema.crmContacts,
    schema.crmLeads,
    schema.whatsappConversations,
    schema.whatsappMessages,
    schema.smsConversations,
    schema.smsMessages,
    schema.commerceOrders,
    schema.businessAuditEvents,
  ]) {
    const config = getTableConfig(table);
    await client.execute(
      `CREATE TABLE "${config.name}" (${config.columns.map((c) => `"${c.name}" ${c.getSQLType()}${c.name === "id" ? " PRIMARY KEY" : ""}`).join(",")})`,
    );
  }
  const migration = readFileSync(
    "drizzle/0114_voice_cases_attention.sql",
    "utf8",
  );
  // Baseline call table already has the new nullable metadata column in this fixture.
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (/ALTER TABLE `voice_phone_calls`/.test(statement)) continue;
    await client.execute(statement.trim());
  }
}
