/**
 * Moves every WhatsApp row from the organization no project owns into the
 * organization that owns the named project.
 *
 * When projects were split into their own organizations, the WhatsApp rows
 * were left behind on purpose ("leave them"). That made them invisible — and
 * worse, the Meta webhook routes an incoming message by phone_number_id to
 * the connection's organization, so live messages were landing where nobody
 * could read them. This puts the connection, and everything hanging off it,
 * under the project it belongs to.
 *
 * One transaction, and every moved row is recorded in organization_split_audit
 * with the organization it came from, so the move reverses from the record.
 *
 * Usage:
 *   tsx scripts/move-whatsapp-to-project.ts --dry-run "BooXworm"
 *   tsx scripts/move-whatsapp-to-project.ts --apply   "BooXworm"
 */
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = process.argv.includes("--dry-run");
const projectName = process.argv.find(
  (a) => !a.startsWith("--") && !a.endsWith(".ts") && !a.includes("/"),
);
if (APPLY === DRY_RUN)
  throw new Error("Pass exactly one of --dry-run or --apply.");
if (!projectName)
  throw new Error("Pass the project name as the last argument.");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required.");
const sql = postgres(url, { ssl: "require", max: 1 });

const WHATSAPP_TABLES = [
  "whatsapp_messages",
  "whatsapp_internal_notes",
  "whatsapp_contact_tag_assignments",
  "whatsapp_contact_attributes",
  "whatsapp_conversations",
  "whatsapp_contact_profiles",
  "whatsapp_tags",
  "whatsapp_templates",
  "whatsapp_campaigns",
  "whatsapp_automation_rules",
  "whatsapp_order_requests",
  "whatsapp_connections",
];

async function main(projectName: string) {
  const [target] =
    await sql`select id, name, organization_id from projects where name = ${projectName} and archived_at is null`;
  if (!target) throw new Error(`No project named "${projectName}".`);
  // The orphan: an organization holding a WhatsApp connection that no project points at.
  const orphans = await sql`
    select distinct c.organization_id from whatsapp_connections c
     where not exists (select 1 from projects p where p.organization_id = c.organization_id)`;
  if (orphans.length !== 1)
    throw new Error(
      `Expected exactly one orphaned organization, found ${orphans.length}.`,
    );
  const from = orphans[0].organization_id as string;
  const to = target.organization_id as string;

  console.log(
    `\nMoving WhatsApp data: orphaned ${from.slice(0, 8)}… -> "${target.name}" (${to.slice(0, 8)}…)\n`,
  );
  let total = 0;
  for (const t of WHATSAPP_TABLES) {
    const [{ n }] =
      await sql`select count(*)::int as n from ${sql(t)} where organization_id = ${from}`;
    if (n > 0) {
      console.log(`  ${t.padEnd(34)} ${String(n).padStart(4)} row(s)`);
      total += n;
    }
  }
  console.log(`  ${"total".padEnd(34)} ${String(total).padStart(4)}`);
  if (total === 0) {
    console.log("\nNothing to move.\n");
    await sql.end();
    return;
  }
  if (DRY_RUN) {
    console.log("\nDry run: nothing was written.\n");
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    for (const t of WHATSAPP_TABLES) {
      const moved =
        await tx`update ${tx(t)} set organization_id = ${to} where organization_id = ${from} returning id`;
      for (const row of moved) {
        await tx`insert into organization_split_audit ${tx({
          id: crypto.randomUUID().replace(/-/g, ""),
          table_name: t,
          row_id: String(row.id),
          from_organization_id: from,
          to_organization_id: to,
        })}`;
      }
      if (moved.length)
        console.log(`  moved ${String(moved.length).padStart(4)}  ${t}`);
    }
  });
  console.log(
    `\nDone. ${total} row(s) now under "${target.name}". Reversal record in organization_split_audit.\n`,
  );
  await sql.end();
}
await main(projectName);
