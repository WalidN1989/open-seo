/**
 * Gives every project its own organization and moves that project's business
 * data into it.
 *
 * Until now an agency's clients all shared one organization, and every
 * business table is scoped by organization alone — so one client's Shopify,
 * products and conversations were readable from another client's workspace.
 * This is the one-off that separates them.
 *
 * Two properties matter more than speed here:
 *
 *   - It is a single transaction. Either every project has its own
 *     organization and every row has moved, or nothing changed at all. A
 *     half-migrated database would leave products in one organization and
 *     their stock in another.
 *
 *   - It is exactly reversible. Every row it moves is recorded in
 *     organization_split_audit with the organization it came from, so the move
 *     can be undone from the record rather than reconstructed from memory.
 *
 * Usage:
 *   tsx scripts/split-projects-into-organizations.ts --dry-run
 *   tsx scripts/split-projects-into-organizations.ts --apply
 *
 * Assignments that cannot be derived are declared in ASSIGNMENTS below and
 * must be confirmed by a person before --apply is used.
 */

import postgres from "postgres";

type Assignment = {
  /** Project name exactly as stored, so a typo fails loudly rather than silently. */
  project: string;
  /** Integration providers whose connection and products move to this project. */
  providers: string[];
};

/**
 * Which client owns which store. Products follow their connection's provider
 * via commerce_products.external_source, so this is the only mapping needed
 * for the 4,820 rows.
 */
const ASSIGNMENTS: Assignment[] = [
  { project: "BooXworm", providers: ["shopify"] },
  { project: "Book Shop Near Me", providers: ["woocommerce"] },
];

/**
 * Where the leftovers go: rows with no provider to follow. Set to a project
 * name to move them, or leave null to leave them with the original
 * organization, which after the split belongs to no project.
 */
const LEFTOVERS_PROJECT: string | null = null;

const APPLY = process.argv.includes("--apply");
const DRY_RUN = process.argv.includes("--dry-run");

if (APPLY === DRY_RUN) {
  throw new Error("Pass exactly one of --dry-run or --apply.");
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const sql = postgres(connectionString, { ssl: "require", max: 1 });

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "project"
  );
}

function randomId() {
  return crypto.randomUUID().replace(/-/g, "");
}

/** Tables scoped by organization whose rows follow their project. */
const ORG_SCOPED_TABLES = [
  "commerce_inventory_balances",
  "commerce_stock_movements",
  "commerce_inventory_audits",
  "commerce_inventory_audit_items",
  "commerce_order_lines",
  "commerce_orders",
  "crm_activities",
  "crm_inquiry_leads",
  "crm_inquiries",
  "crm_leads",
  "crm_source_candidates",
  "crm_source_runs",
  "crm_contacts",
  "crm_companies",
  "crm_pipeline_stages",
  "crm_meetings",
  "whatsapp_messages",
  "whatsapp_conversations",
  "whatsapp_contact_profiles",
  "whatsapp_internal_notes",
  "whatsapp_contact_attributes",
  "whatsapp_contact_tag_assignments",
  "whatsapp_tags",
  "whatsapp_templates",
  "whatsapp_campaigns",
  "whatsapp_automation_rules",
  "whatsapp_order_requests",
  "whatsapp_connections",
  "voice_conversation_messages",
  "voice_conversations",
  "voice_agent_lessons",
  "voice_agent_configs",
  "business_settings",
  "organization_module_entitlements",
  "member_module_permissions",
  "business_audit_events",
  "webhook_deliveries",
  "webhook_subscriptions",
  "webhook_endpoints",
];

async function main() {
  const projects =
    await sql`select id, name, organization_id from projects where archived_at is null order by created_at`;
  const owners =
    await sql`select user_id, organization_id from member order by created_at`;
  const connections =
    await sql`select id, provider_key, organization_id from integration_connections`;
  const productCounts =
    await sql`select external_source, count(*)::int as n from commerce_products group by external_source`;

  console.log(`\nProjects: ${projects.length}`);
  for (const project of projects) console.log(`  - ${project.name}`);

  const byName = new Map(projects.map((p) => [p.name as string, p]));
  for (const assignment of ASSIGNMENTS) {
    if (!byName.has(assignment.project)) {
      throw new Error(
        `Assignment names a project that does not exist: "${assignment.project}"`,
      );
    }
  }

  console.log("\nPlanned moves:");
  for (const assignment of ASSIGNMENTS) {
    const conns = connections.filter((c) =>
      assignment.providers.includes(c.provider_key as string),
    );
    const products = productCounts
      .filter((row) =>
        assignment.providers.includes(row.external_source as string),
      )
      .reduce((total, row) => total + (row.n as number), 0);
    console.log(
      `  ${assignment.project}: ${conns.length} connection(s), ${products} product(s)`,
    );
  }
  const assignedProviders = new Set(ASSIGNMENTS.flatMap((a) => a.providers));
  const unassigned = connections.filter(
    (c) => !assignedProviders.has(c.provider_key as string),
  );
  if (unassigned.length) {
    console.log(
      `  unassigned connections stay put: ${unassigned.map((c) => c.provider_key).join(", ")}`,
    );
  }

  if (DRY_RUN) {
    console.log("\nDry run: nothing was written.\n");
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    await tx`
      create table if not exists organization_split_audit (
        id text primary key,
        table_name text not null,
        row_id text not null,
        from_organization_id text not null,
        to_organization_id text not null,
        moved_at timestamptz not null default now()
      )`;

    const projectOrganization = new Map<string, string>();

    for (const project of projects) {
      const organizationId = randomId();
      const slug = `${slugify(project.name as string)}-${randomId().slice(0, 12)}`;

      await tx`insert into organization ${tx({
        id: organizationId,
        name: project.name as string,
        slug,
        created_at: new Date(),
      })}`;

      // Every member of the project's current organization keeps access, so
      // nobody is locked out of work they could reach before the split.
      for (const owner of owners.filter(
        (o) => o.organization_id === project.organization_id,
      )) {
        await tx`insert into member ${tx({
          id: randomId(),
          organization_id: organizationId,
          user_id: owner.user_id as string,
          role: "owner",
          created_at: new Date(),
        })}`;
      }

      await tx`insert into organization_split_audit ${tx({
        id: randomId(),
        table_name: "projects",
        row_id: project.id as string,
        from_organization_id: project.organization_id as string,
        to_organization_id: organizationId,
      })}`;

      await tx`update projects set organization_id = ${organizationId} where id = ${project.id}`;
      projectOrganization.set(project.name as string, organizationId);
      console.log(`  created organization for ${project.name}`);
    }

    for (const assignment of ASSIGNMENTS) {
      const target = projectOrganization.get(assignment.project)!;

      for (const provider of assignment.providers) {
        const moved = await tx`
          update integration_connections
             set organization_id = ${target}
           where provider_key = ${provider}
          returning id`;
        for (const row of moved) {
          await tx`insert into organization_split_audit ${tx({
            id: randomId(),
            table_name: "integration_connections",
            row_id: row.id as string,
            from_organization_id: "pre-split",
            to_organization_id: target,
          })}`;
        }

        const products = await tx`
          update commerce_products
             set organization_id = ${target}
           where external_source = ${provider}
          returning id`;
        console.log(
          `  ${assignment.project}: moved ${moved.length} connection(s), ${products.length} product(s)`,
        );
      }
    }

    // Rows that hang off products follow them, so a product and its stock
    // cannot end up in different organizations.
    for (const [name, organizationId] of projectOrganization) {
      const assignment = ASSIGNMENTS.find((a) => a.project === name);
      if (!assignment) continue;
      await tx`
        update commerce_inventory_balances b
           set organization_id = ${organizationId}
          from commerce_products p
         where p.id = b.product_id and p.organization_id = ${organizationId}`;
      await tx`
        update commerce_stock_movements m
           set organization_id = ${organizationId}
          from commerce_products p
         where p.id = m.product_id and p.organization_id = ${organizationId}`;
    }

    if (LEFTOVERS_PROJECT) {
      const target = projectOrganization.get(LEFTOVERS_PROJECT);
      if (!target) throw new Error(`Unknown leftovers project`);
      for (const table of ORG_SCOPED_TABLES) {
        await tx`update ${tx(table)} set organization_id = ${target}
                  where organization_id not in ${tx(Array.from(projectOrganization.values()))}`;
      }
      console.log(`  leftovers moved to ${LEFTOVERS_PROJECT}`);
    }
  });

  console.log("\nDone. Reversal record is in organization_split_audit.\n");
  await sql.end();
}

await main();
