import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";

it("preserves existing verification bindings while making phone uniqueness organization-scoped", async () => {
  const client = createClient({ url: ":memory:" });
  try {
    await client.executeMultiple(`
      CREATE TABLE client_contacts (
        id TEXT PRIMARY KEY, organization_id TEXT, channel TEXT, identifier TEXT,
        client_account_id TEXT, verified_at TEXT, revoked_at TEXT
      );
      CREATE UNIQUE INDEX client_contacts_channel_identifier_idx ON client_contacts(channel, identifier);
      INSERT INTO client_contacts VALUES ('existing', 'agency-a', 'whatsapp', '+61400000001', 'account-a', '2026-10-22T08:00:00Z', NULL);
    `);
    const before = (await client.execute("SELECT * FROM client_contacts")).rows;
    const migration = readFileSync(
      "drizzle/0108_medical_radioactive_man.sql",
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) await client.execute(statement);
    }
    expect(
      (await client.execute("SELECT * FROM client_contacts")).rows,
    ).toEqual(before);
    await client.execute(
      "INSERT INTO client_contacts VALUES ('second', 'agency-b', 'whatsapp', '+61400000001', 'account-b', '2026-10-22T09:00:00Z', NULL)",
    );
    await expect(
      client.execute(
        "INSERT INTO client_contacts VALUES ('duplicate', 'agency-a', 'whatsapp', '+61400000001', 'account-a', NULL, NULL)",
      ),
    ).rejects.toThrow(/UNIQUE/);
    expect(
      (await client.execute("SELECT count(*) AS total FROM client_contacts"))
        .rows[0]?.total,
    ).toBe(2);
  } finally {
    client.close();
  }
});
