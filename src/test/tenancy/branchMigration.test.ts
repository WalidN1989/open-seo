import { readdirSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { expect, it } from "vitest";

it("backfills one default branch without losing stock, audit lines or order lines with foreign keys enabled", async () => {
  const directory = mkdtempSync(join(tmpdir(), "branch-migration-"));
  const client = createClient({ url: `file:${directory}/test.db` });
  try {
    const migrations = readdirSync("drizzle")
      .filter((file) => file.endsWith(".sql"))
      .toSorted();
    for (const file of migrations.filter((name) => !name.startsWith("0094_"))) {
      for (const sql of readFileSync(`drizzle/${file}`, "utf8")
        .split("--> statement-breakpoint")
        .filter((value) => value.trim()))
        await client.execute(sql);
    }
    await client.execute("PRAGMA foreign_keys=ON");
    await client.execute(
      "INSERT INTO organization (id, name, slug, created_at) VALUES ('legacy-org', 'Legacy', 'legacy', 1)",
    );
    await client.execute(
      "INSERT INTO commerce_products (id, organization_id, sku, name) VALUES ('p', 'legacy-org', 'SKU', 'Product')",
    );
    await client.execute(
      "INSERT INTO commerce_inventory_balances (id, organization_id, product_id, quantity_on_hand) VALUES ('b', 'legacy-org', 'p', 12)",
    );
    await client.execute(
      "INSERT INTO commerce_stock_movements (id, organization_id, product_id, movement_type, quantity_delta) VALUES ('m', 'legacy-org', 'p', 'receipt', 12)",
    );
    await client.execute(
      "INSERT INTO commerce_inventory_audits (id, organization_id, name) VALUES ('a', 'legacy-org', 'Count')",
    );
    await client.execute(
      "INSERT INTO commerce_inventory_audit_items (id, organization_id, audit_id, product_id, counted_quantity) VALUES ('ai', 'legacy-org', 'a', 'p', 12)",
    );
    await client.execute(
      "INSERT INTO commerce_orders (id, organization_id, order_number) VALUES ('o', 'legacy-org', 'ORD-1')",
    );
    await client.execute(
      "INSERT INTO commerce_order_lines (id, organization_id, order_id, product_id, description, quantity, unit_price_minor, line_total_minor) VALUES ('ol', 'legacy-org', 'o', 'p', 'Product', 2, 100, 200)",
    );
    const file = migrations.find((name) => name.startsWith("0094_"));
    const transaction = await client.transaction("write");
    try {
      for (const sql of readFileSync(`drizzle/${file}`, "utf8")
        .split("--> statement-breakpoint")
        .filter((value) => value.trim()))
        await transaction.execute(sql);
      await transaction.commit();
    } finally {
      transaction.close();
    }
    expect(
      (
        await client.execute(
          "SELECT quantity_on_hand, branch_id FROM commerce_inventory_balances",
        )
      ).rows,
    ).toEqual([{ quantity_on_hand: 12, branch_id: "default:legacy-org" }]);
    expect(
      (await client.execute("SELECT id FROM commerce_inventory_audit_items"))
        .rows,
    ).toEqual([{ id: "ai" }]);
    expect(
      (await client.execute("SELECT id FROM commerce_order_lines")).rows,
    ).toEqual([{ id: "ol" }]);
    expect(
      (await client.execute("SELECT count(*) AS n FROM commerce_branches"))
        .rows[0]?.n,
    ).toBe(1);
    expect(
      (await client.execute("PRAGMA foreign_key_check")).rows,
    ).toHaveLength(0);
  } finally {
    client.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
