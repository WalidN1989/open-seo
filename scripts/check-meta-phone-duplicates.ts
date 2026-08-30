import postgres from "postgres";
import { loadLocalEnv } from "./cli-utils";

/**
 * Pre-migration check for the Meta phone-number backfill.
 *
 * Migration 0060 (SQLite) / 0038 (Postgres) copies external_account_id into
 * phone_number_id for meta_cloud connections and then adds a unique index on
 * (provider, phone_number_id). If two organizations somehow hold the same Meta
 * phone number, that index cannot be created and the migration aborts — which
 * is the correct outcome, but a failed CREATE INDEX does not say which rows
 * caused it or who they belong to.
 *
 * Run this first. It names the clashing rows so the conflict is resolved
 * deliberately rather than by whichever tenant the database happens to keep.
 *
 *   POSTGRES_DATABASE_URL=... pnpm exec tsx scripts/check-meta-phone-duplicates.ts
 */
async function main() {
  loadLocalEnv();
  const url = process.env.POSTGRES_DATABASE_URL;
  if (!url) {
    console.error("POSTGRES_DATABASE_URL is not set.");
    process.exit(2);
  }

  const sql = postgres(url, { ssl: "require", max: 1 });
  try {
    // This runs BEFORE the migration, so phone_number_id may not exist yet.
    // Referencing it unconditionally is what made the first version of this
    // script useless at the only moment it matters.
    const [{ exists: hasPhoneColumn }] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'whatsapp_connections'
          AND column_name = 'phone_number_id'
      ) AS exists`;

    // Post-migration, a row already carrying a phone_number_id is not a
    // backfill candidate and cannot collide with one.
    const candidates = hasPhoneColumn
      ? sql`AND phone_number_id IS NULL`
      : sql``;

    const duplicates = await sql<
      {
        external_account_id: string;
        connections: number;
        organizations: number;
      }[]
    >`
      SELECT external_account_id,
             count(*)::int AS connections,
             count(DISTINCT organization_id)::int AS organizations
      FROM whatsapp_connections
      WHERE provider = 'meta_cloud'
        AND external_account_id IS NOT NULL
        AND external_account_id <> ''
        ${candidates}
      GROUP BY external_account_id
      HAVING count(*) > 1
      ORDER BY count(*) DESC`;

    if (duplicates.length > 0) {
      console.error(
        "Duplicate Meta phone numbers found. The migration would fail; resolve these first.",
      );
      for (const row of duplicates) {
        // The phone-number id is public, not a secret. Organizations are
        // counted rather than named so this can be pasted into an issue.
        console.error(
          `  ${row.external_account_id}: ${row.connections} connections across ${row.organizations} organizations`,
        );
      }
      process.exit(1);
    }

    const [counts] = await sql<{ total: number; backfillable: number }[]>`
      SELECT count(*)::int AS total,
             count(*) FILTER (
               WHERE external_account_id IS NOT NULL AND external_account_id <> ''
             )::int AS backfillable
      FROM whatsapp_connections
      WHERE provider = 'meta_cloud' ${candidates}`;

    console.log(
      `No duplicate Meta phone numbers. ${counts.backfillable} of ${counts.total} meta_cloud connection(s) will be backfilled.`,
    );
    if (counts.total > counts.backfillable) {
      console.log(
        `${counts.total - counts.backfillable} have no external_account_id and will stay unconfigured until set by hand.`,
      );
    }
  } finally {
    await sql.end();
  }
}

await main();
