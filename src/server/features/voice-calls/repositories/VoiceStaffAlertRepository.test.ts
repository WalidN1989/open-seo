import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
import * as schema from "@/db/business.schema";
const state = vi.hoisted((): { db: unknown } => ({ db: null }));
vi.mock("@/db", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@/db/schema", async () => import("@/db/business.schema"));
import { VoiceStaffAlertRepository as repo } from "./VoiceStaffAlertRepository";
const client = createClient({ url: ":memory:" });
beforeAll(async () => {
  state.db = drizzle(client, { schema });
  for (const table of [
    schema.whatsappConnections,
    schema.whatsappConversations,
    schema.voicePhoneCalls,
    schema.customerActionRequests,
  ]) {
    const config = getTableConfig(table);
    await client.execute(
      `CREATE TABLE "${config.name}" (${config.columns.map((c) => `"${c.name}" ${c.getSQLType()}${c.primary ? " PRIMARY KEY" : ""}`).join(",")})`,
    );
  }
  await client.execute(
    "CREATE UNIQUE INDEX chat_identity ON whatsapp_conversations(connection_id,external_conversation_id)",
  );
});
afterAll(() => client.close());
beforeEach(async () => {
  for (const table of [
    "whatsapp_connections",
    "whatsapp_conversations",
    "voice_phone_calls",
    "customer_action_requests",
  ])
    await client.execute(`DELETE FROM ${table}`);
});
it("chooses only this tenant's connected Twilio sender", async () => {
  await client.execute(
    "INSERT INTO whatsapp_connections(id,organization_id,provider,status,created_at) VALUES ('foreign','other','twilio','connected','2026-01-01'),('meta','org','meta','connected','2026-01-01'),('off','org','twilio','disconnected','2026-01-01'),('right','org','twilio','connected','2026-02-01')",
  );
  expect((await repo.sender("org"))?.id).toBe("right");
});
it("reserves one staff chat and respects opt-out and tenant scope", async () => {
  await Promise.all([
    repo.staffChat("org", "sender", "+94770000002"),
    repo.staffChat("org", "sender", "+94770000002"),
  ]);
  expect(
    (await client.execute("SELECT id FROM whatsapp_conversations")).rows,
  ).toHaveLength(1);
  expect(await repo.staffChat("other", "sender", "+94770000002")).toBeNull();
  await client.execute(
    "UPDATE whatsapp_conversations SET opted_out_at='2026-10-31T00:00:00Z'",
  );
  expect(await repo.staffChat("org", "sender", "+94770000002")).toBeNull();
});
it("bounds pending alerts to the correct organization, staff chat and alert kind", async () => {
  await client.execute(
    "INSERT INTO customer_action_requests(id,organization_id,whatsapp_conversation_id,kind,status,created_at) VALUES ('right','org','chat','system_voice_staff_alert','pending','2026-10-31'),('foreign','other','chat','system_voice_staff_alert','pending','2026-10-31'),('different-chat','org','other','system_voice_staff_alert','pending','2026-10-31'),('sent','org','chat','system_voice_staff_alert','completed','2026-10-31'),('customer','org','chat','send_whatsapp','pending','2026-10-31')",
  );
  expect((await repo.pending("org", "chat")).map((row) => row.id)).toEqual([
    "right",
  ]);
});
