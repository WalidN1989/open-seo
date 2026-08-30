import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * The backfill in migration 0060, run the way production will run it.
 *
 * Migrations are applied up to the one before it, legacy rows are inserted as
 * they exist today, and only then is 0060 applied — so this proves the
 * behaviour of the SQL itself rather than of a schema that already has the
 * column.
 */

const DIR = join(process.cwd(), "drizzle");
const BACKFILL_MIGRATION = "0060_slim_valeria_richards.sql";

function statementsIn(file: string) {
  return readFileSync(join(DIR, file), "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function migrationsBefore(target: string) {
  return readdirSync(DIR)
    .filter((name) => name.endsWith(".sql") && name < target)
    .toSorted();
}

async function migratedToJustBefore(): Promise<Client> {
  const client = createClient({ url: ":memory:" });
  for (const file of migrationsBefore(BACKFILL_MIGRATION)) {
    for (const statement of statementsIn(file)) {
      await client.execute(statement);
    }
  }
  return client;
}

async function applyBackfill(client: Client) {
  for (const statement of statementsIn(BACKFILL_MIGRATION)) {
    await client.execute(statement);
  }
}

async function seedOrganization(client: Client, id: string) {
  await client.execute({
    sql: "INSERT INTO organization (id, name, slug, created_at) VALUES (?, ?, ?, ?)",
    args: [id, id, id, Date.now()],
  });
}

async function seedConnection(
  client: Client,
  row: {
    id: string;
    organizationId: string;
    provider: string;
    externalAccountId: string | null;
  },
) {
  await client.execute({
    sql: `INSERT INTO whatsapp_connections
            (id, organization_id, provider, external_account_id, status, updated_at)
          VALUES (?, ?, ?, ?, 'connected', '2026-08-30T00:00:00.000Z')`,
    args: [row.id, row.organizationId, row.provider, row.externalAccountId],
  });
}

async function phoneNumberIdOf(client: Client, id: string) {
  const result = await client.execute({
    sql: "SELECT phone_number_id FROM whatsapp_connections WHERE id = ?",
    args: [id],
  });
  return result.rows[0]?.phone_number_id ?? null;
}

let client: Client;

beforeEach(async () => {
  client = await migratedToJustBefore();
  await seedOrganization(client, "org_a");
  await seedOrganization(client, "org_b");
});

describe("backfilling Meta phone numbers", () => {
  it("copies external_account_id into phone_number_id for a Meta connection", async () => {
    // external_account_id already held Meta's phone-number id: it is the value
    // the Graph send endpoint uses. Without this, every existing connection
    // would stop receiving inbound messages until configured by hand.
    await seedConnection(client, {
      id: "conn_meta",
      organizationId: "org_a",
      provider: "meta_cloud",
      externalAccountId: "1234567890",
    });
    await applyBackfill(client);
    expect(await phoneNumberIdOf(client, "conn_meta")).toBe("1234567890");
  });

  it("leaves a Twilio connection alone", async () => {
    // The same column holds the Account SID for Twilio, which is not a phone
    // number id and must never be routed on.
    await seedConnection(client, {
      id: "conn_twilio",
      organizationId: "org_a",
      provider: "twilio",
      externalAccountId: "ACxxxxxxxxxxxxxxxx",
    });
    await applyBackfill(client);
    expect(await phoneNumberIdOf(client, "conn_twilio")).toBeNull();
  });

  it("leaves a Meta connection with no external account id null", async () => {
    await seedConnection(client, {
      id: "conn_blank",
      organizationId: "org_a",
      provider: "meta_cloud",
      externalAccountId: null,
    });
    await applyBackfill(client);
    expect(await phoneNumberIdOf(client, "conn_blank")).toBeNull();
  });

  it("treats an empty string as unconfigured rather than backfilling it", async () => {
    await seedConnection(client, {
      id: "conn_empty",
      organizationId: "org_a",
      provider: "meta_cloud",
      externalAccountId: "",
    });
    await applyBackfill(client);
    expect(await phoneNumberIdOf(client, "conn_empty")).toBeNull();
  });

  it("does not overwrite a phone_number_id that is already set", async () => {
    await seedConnection(client, {
      id: "conn_set",
      organizationId: "org_a",
      provider: "meta_cloud",
      externalAccountId: "old_value",
    });
    // Add the columns, set one deliberately, then run the backfill statements.
    const [addPhone, addWaba, addChecked, addError] =
      statementsIn(BACKFILL_MIGRATION);
    for (const statement of [addPhone, addWaba, addChecked, addError]) {
      await client.execute(statement);
    }
    await client.execute({
      sql: "UPDATE whatsapp_connections SET phone_number_id = ? WHERE id = ?",
      args: ["already_correct", "conn_set"],
    });
    for (const statement of statementsIn(BACKFILL_MIGRATION).slice(4)) {
      await client.execute(statement);
    }
    expect(await phoneNumberIdOf(client, "conn_set")).toBe("already_correct");
  });

  it("allows several Meta connections that are not yet configured", async () => {
    // NULLs are distinct under a unique index, so unconfigured rows coexist.
    for (const id of ["conn_1", "conn_2", "conn_3"]) {
      await seedConnection(client, {
        id,
        organizationId: "org_a",
        provider: "meta_cloud",
        externalAccountId: null,
      });
    }
    await expect(applyBackfill(client)).resolves.not.toThrow();
  });

  it("supports several numbers in one organization", async () => {
    await seedConnection(client, {
      id: "conn_first",
      organizationId: "org_a",
      provider: "meta_cloud",
      externalAccountId: "111",
    });
    await seedConnection(client, {
      id: "conn_second",
      organizationId: "org_a",
      provider: "meta_cloud",
      externalAccountId: "222",
    });
    await applyBackfill(client);
    expect(await phoneNumberIdOf(client, "conn_first")).toBe("111");
    expect(await phoneNumberIdOf(client, "conn_second")).toBe("222");
  });
});

describe("duplicate Meta identifiers", () => {
  it("fails the migration rather than silently choosing one tenant", async () => {
    // The same Meta number claimed by two organizations cannot be routed
    // unambiguously. Aborting is the correct outcome; the preflight script
    // exists to name the rows before it happens.
    await seedConnection(client, {
      id: "conn_a",
      organizationId: "org_a",
      provider: "meta_cloud",
      externalAccountId: "shared_number",
    });
    await seedConnection(client, {
      id: "conn_b",
      organizationId: "org_b",
      provider: "meta_cloud",
      externalAccountId: "shared_number",
    });
    await expect(applyBackfill(client)).rejects.toThrow();
  });

  it("still refuses when the duplicate is inside one organization", async () => {
    await seedConnection(client, {
      id: "conn_x",
      organizationId: "org_a",
      provider: "meta_cloud",
      externalAccountId: "same",
    });
    await seedConnection(client, {
      id: "conn_y",
      organizationId: "org_a",
      provider: "meta_cloud",
      externalAccountId: "same",
    });
    await expect(applyBackfill(client)).rejects.toThrow();
  });

  it("permits the same identifier across different providers", async () => {
    // The unique index is on (provider, phone_number_id), and Twilio is never
    // backfilled anyway.
    await seedConnection(client, {
      id: "conn_meta",
      organizationId: "org_a",
      provider: "meta_cloud",
      externalAccountId: "1234",
    });
    await seedConnection(client, {
      id: "conn_twilio",
      organizationId: "org_a",
      provider: "twilio",
      externalAccountId: "1234",
    });
    await expect(applyBackfill(client)).resolves.not.toThrow();
  });
});
