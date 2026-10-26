import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createWhatsappAiSettingsDatabase } from "@/test/tenancy/whatsappAiSettingsDatabase";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@/db/schema", async () => ({
  ...(await import("@/db/pg/business.schema")),
  ...(await import("@/db/pg/better-auth-schema")),
}));
vi.mock("@/db/runBatch", () => ({
  runBatch: async (build: (tx: unknown) => readonly Promise<unknown>[]) => {
    await drizzle(client).transaction(async (tx) => {
      for (const statement of build(tx)) await statement;
    });
  },
}));
import { WhatsappAiSettingsRepository as Repo } from "./repositories/WhatsappAiSettingsRepository";
// Opt-in only against a disposable local DB; CI still exercises SQLite + protocol.
const url = process.env.DU_AI_SETTINGS_TEST_POSTGRES;
if (
  url &&
  (!new URL(url).hostname.match(/^(localhost|127\.0\.0\.1)$/) ||
    new URL(url).port !== "55439")
)
  throw new Error("Use the disposable local test database on port 55439.");
const schema = `du_ai_settings_${crypto.randomUUID().replaceAll("-", "")}`;
const client = postgres(url ?? "postgres://localhost:55439/unused", {
  max: 15,
  connection: { search_path: schema },
});
const before = { instructions: null, handoffMessage: null };
const change = (text: string) =>
  Repo.change({
    organizationId: "a",
    actorUserId: "operator",
    before,
    after: { ...before, instructions: text },
    operation: "update",
  });

describe.skipIf(!url)("WhatsApp settings real Postgres transactions", () => {
  beforeAll(async () => {
    await client.unsafe(`CREATE SCHEMA ${schema}`);
    await createWhatsappAiSettingsDatabase(
      (sql) => client.unsafe(sql),
      "postgres",
    );
    state.db = drizzle(client);
  });
  beforeEach(async () => {
    await client.unsafe(
      "DROP TRIGGER IF EXISTS reject_backup ON business_audit_events",
    );
    await client.unsafe(
      "TRUNCATE whatsapp_assistant_settings,business_audit_events",
    );
  });
  afterAll(async () => {
    await client.unsafe(`DROP SCHEMA ${schema} CASCADE`);
    await client.end();
  });
  it("serializes twelve concurrent changes and backs up exactly the winner", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => change(`Rule ${i}`)),
    );
    const winner = results.filter((row) => row !== null);
    expect(winner).toHaveLength(1);
    const versions = await Repo.history("a", 20, 0);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.actorUserId).toBe("operator");
    expect(await Repo.history("b", 20, 0)).toEqual([]);
    const settings = await client.unsafe<
      { persona: string; autopilot: boolean }[]
    >("SELECT persona,autopilot FROM whatsapp_assistant_settings");
    expect(settings).toHaveLength(1);
    const metadata: unknown = JSON.parse(winner[0]?.metadataJson ?? "null");
    expect(metadata).toEqual({
      schemaVersion: 1,
      operation: "update",
      before,
      after: { instructions: settings[0]?.persona, handoffMessage: null },
    });
    expect(settings[0]?.autopilot).toBe(true);
    expect(await Repo.getVersion("b", winner[0]?.id ?? "")).toBeNull();
  });
  it("rolls back a write when the audit backup cannot be stored", async () => {
    await client.unsafe(
      "CREATE OR REPLACE FUNCTION reject_backup_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'backup unavailable'; END $$",
    );
    await client.unsafe(
      "CREATE TRIGGER reject_backup BEFORE INSERT ON business_audit_events FOR EACH ROW EXECUTE FUNCTION reject_backup_fn()",
    );
    await expect(change("Must roll back")).rejects.toThrow();
    expect(
      await client.unsafe("SELECT * FROM whatsapp_assistant_settings"),
    ).toHaveLength(0);
    expect(await Repo.history("a", 20, 0)).toHaveLength(0);
  });
});
