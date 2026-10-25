import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { seedTenancyFixture, type TestDb } from "./fixture";

/** Opt-in real Postgres contract tests; each run owns a disposable local database. */
export async function createPostgresTenancyFixture(url: string) {
  const address = new URL(url);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(address.hostname) ||
    address.pathname !== "/du_handoff_test"
  )
    throw new Error(
      "Postgres tests require the dedicated local du_handoff_test database",
    );
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  const name = "du_test_" + crypto.randomUUID().replaceAll("-", "");
  await admin.unsafe(`CREATE DATABASE "${name}"`);
  address.pathname = "/" + name;
  const client = postgres(address.href, { max: 4, onnotice: () => {} });
  try {
    for (const file of readdirSync(join(process.cwd(), "drizzle-pg"))
      .filter((f) => f.endsWith(".sql"))
      .toSorted()) {
      const contents = readFileSync(
        join(process.cwd(), "drizzle-pg", file),
        "utf8",
      );
      for (const statement of contents.split("--> statement-breakpoint"))
        if (statement.trim()) await client.unsafe(statement);
    }
    // Canonical schema has the SQLite type identity and the provider-selected runtime tables.
    // The application's db/runBatch use the same structural bridge for the two drivers.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test-only bridge matches the provider-aware db/runBatch seam, with schema parity checked separately
    const db = drizzle(client) as unknown as TestDb;
    await seedTenancyFixture(db);
    return {
      db,
      client: {
        close: async () => {
          await client.end();
          await admin.unsafe(`DROP DATABASE "${name}"`);
          await admin.end();
        },
      },
    };
  } catch (error) {
    await client.end();
    await admin.unsafe(`DROP DATABASE "${name}"`);
    await admin.end();
    throw error;
  }
}
