import { readFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { describe, it, expect } from "vitest";

async function executeMigration(
  client: ReturnType<typeof createClient>,
  name: string,
) {
  for (const statement of readFileSync(`drizzle/${name}`, "utf8").split(
    "--> statement-breakpoint",
  ))
    if (statement.trim()) await client.execute(statement);
}
describe("Citypak upgrades from released order mirror schema", () => {
  it("preserves existing shipments, indexes and foreign keys while adding default creation times", async () => {
    const client = createClient({ url: ":memory:" });
    try {
      await client.execute("PRAGMA foreign_keys=ON");
      for (const table of [
        "organization",
        "integration_connections",
        "commerce_orders",
        "commerce_order_lines",
        "crm_contacts",
        "whatsapp_connections",
        "whatsapp_templates",
        "whatsapp_messages",
        "invoices",
      ])
        await client.execute(`CREATE TABLE ${table} (id TEXT PRIMARY KEY)`);
      await client.execute("INSERT INTO organization VALUES ('org-a')");
      await client.execute("INSERT INTO commerce_orders VALUES ('order-a')");
      await executeMigration(client, "0098_melted_red_shift.sql");
      expect(
        (
          await client.execute("PRAGMA table_info(commerce_order_shipments)")
        ).rows.some((row) => row.name === "created_at"),
      ).toBe(false);
      await client.execute(
        "INSERT INTO commerce_order_shipments (id,organization_id,order_id,provider,tracking_number,status,checked_at) VALUES ('old','org-a','order-a','Citypak','DOLD','DELIVERED','2026-10-14T01:00:00.000Z'),('unchecked','org-a','order-a','Citypak','DUNCHECKED','PENDING',NULL)",
      );
      await executeMigration(client, "0099_friendly_blue_shield.sql");
      const old = (
        await client.execute(
          "SELECT * FROM commerce_order_shipments WHERE id='old'",
        )
      ).rows[0];
      expect(old).toMatchObject({
        organization_id: "org-a",
        order_id: "order-a",
        provider: "Citypak",
        tracking_number: "DOLD",
        status: "DELIVERED",
        checked_at: "2026-10-14T01:00:00.000Z",
        created_at: "2026-10-14T01:00:00.000Z",
      });
      expect(
        (
          await client.execute(
            "SELECT created_at FROM commerce_order_shipments WHERE id='unchecked'",
          )
        ).rows[0].created_at,
      ).toBeTruthy();
      await client.execute(
        "INSERT INTO commerce_order_shipments (id,organization_id,order_id,provider,tracking_number) VALUES ('new','org-a','order-a','Citypak','DNEW')",
      );
      expect(
        (
          await client.execute(
            "SELECT created_at FROM commerce_order_shipments WHERE id='new'",
          )
        ).rows[0].created_at,
      ).toBeTruthy();
      await expect(
        client.execute(
          "INSERT INTO commerce_order_shipments (id,organization_id,order_id,provider,tracking_number) VALUES ('duplicate','org-a','order-a','Citypak','DOLD')",
        ),
      ).rejects.toThrow();
      await expect(
        client.execute(
          "INSERT INTO commerce_order_shipments (id,organization_id,order_id,provider,tracking_number) VALUES ('foreign','missing','order-a','Citypak','DFOREIGN')",
        ),
      ).rejects.toThrow();
      expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual(
        [],
      );
      await client.execute(
        "INSERT INTO commerce_shipment_events (id,organization_id,shipment_id,status,event_at,source) VALUES ('event','org-a','old','DELIVERED','2026-10-14T01:00:00.000Z','pull')",
      );
      await client.execute(
        "DELETE FROM commerce_order_shipments WHERE id='old'",
      );
      expect(
        (await client.execute("SELECT id FROM commerce_shipment_events")).rows,
      ).toEqual([]);
      const snapshot: unknown = JSON.parse(
        readFileSync("drizzle/meta/0099_snapshot.json", "utf8"),
      );
      expect(snapshot).toMatchObject({
        tables: {
          commerce_order_shipments: {
            columns: {
              created_at: { notNull: true, default: "(current_timestamp)" },
            },
          },
        },
      });
      expect(
        (
          await client.execute("PRAGMA index_list(commerce_order_shipments)")
        ).rows.map((row) => row.name),
      ).toContain("commerce_order_shipments_order_idx");
    } finally {
      client.close();
    }
  });
});
