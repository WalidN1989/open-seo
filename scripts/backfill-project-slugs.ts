/**
 * Gives existing projects the readable address segment that new ones get on
 * creation: /p/booxworm rather than /p/fe7b986f-5a61-4eb1-ae08-280380c280d9.
 *
 * Idempotent — projects that already have a slug are left alone — so it is
 * safe to run again after adding projects.
 *
 * It reuses the application's own slug helpers rather than reimplementing them
 * in SQL, so a backfilled address is identical to one the app would have
 * generated, and SQLite deployments (which have no regexp_replace) are served
 * by the same script.
 *
 * Usage:
 *   tsx scripts/backfill-project-slugs.ts --dry-run
 *   tsx scripts/backfill-project-slugs.ts --apply
 */

import postgres from "postgres";
import { nextAvailableProjectSlug } from "../src/shared/project-slug";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = process.argv.includes("--dry-run");

if (APPLY === DRY_RUN) {
  throw new Error("Pass exactly one of --dry-run or --apply.");
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const sql = postgres(connectionString, { ssl: "require", max: 1 });

async function main() {
  const rows = await sql<{ id: string; name: string; slug: string | null }[]>`
    select id, name, slug from projects order by created_at`;

  // Seeded with what is already taken so a rerun cannot collide with the slugs
  // an earlier run assigned.
  const taken = new Set(rows.flatMap((row) => (row.slug ? [row.slug] : [])));
  const planned: { id: string; name: string; slug: string }[] = [];

  for (const row of rows) {
    if (row.slug) continue;
    const slug = nextAvailableProjectSlug(row.name, taken);
    taken.add(slug);
    planned.push({ id: row.id, name: row.name, slug });
  }

  if (planned.length === 0) {
    console.log("\nEvery project already has an address. Nothing to do.\n");
    await sql.end();
    return;
  }

  console.log("\nPlanned addresses:");
  for (const item of planned)
    console.log(`  ${item.name}  ->  /p/${item.slug}`);

  if (DRY_RUN) {
    console.log("\nDry run: nothing was written.\n");
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    for (const item of planned) {
      await tx`update projects set slug = ${item.slug} where id = ${item.id}`;
    }
  });

  console.log(`\nDone. ${planned.length} project(s) addressed.\n`);
  await sql.end();
}

await main();
