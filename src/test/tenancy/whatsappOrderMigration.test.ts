import { readFileSync, readdirSync } from "node:fs";
import { createClient } from "@libsql/client";
import { expect, it } from "vitest";

it("upgrades existing WhatsApp orders and backfills only missing, tenant-matched customer details", async () => {
  const client = createClient({ url: ":memory:" });
  try {
    for (const name of readdirSync("drizzle")
      .filter((file) => file.endsWith(".sql") && file < "0106")
      .toSorted())
      for (const statement of readFileSync(`drizzle/${name}`, "utf8").split(
        "--> statement-breakpoint",
      ))
        if (statement.trim()) await client.execute(statement);
    await client.execute(
      "INSERT INTO organization(id,name,slug,created_at) VALUES ('a','A','a',0),('b','B','b',0)",
    );
    await client.execute(
      "INSERT INTO commerce_branches(id,organization_id,name) VALUES ('branch-a','a','Default')",
    );
    await client.execute(
      "INSERT INTO crm_contacts(id,organization_id,first_name,last_name,whatsapp_phone) VALUES ('person-a','a','Sample','Customer','+61400000003'),('person-b','b','Foreign','Customer','+61400000004')",
    );
    await client.execute(
      "INSERT INTO whatsapp_connections(id,organization_id,provider) VALUES ('conn-a','a','twilio'),('conn-b','b','twilio')",
    );
    await client.execute(
      "INSERT INTO whatsapp_conversations(id,organization_id,connection_id,contact_id,external_conversation_id) VALUES ('chat-a','a','conn-a','person-a','+61400000001'),('chat-b','b','conn-b','person-b','+61400000002')",
    );
    await client.execute(
      "INSERT INTO whatsapp_order_requests(id,organization_id,conversation_id,summary) VALUES ('request-a','a','chat-a','Blue book'),('request-b','b','chat-b','Foreign book')",
    );
    await client.execute(
      "INSERT INTO commerce_orders(id,organization_id,branch_id,order_number,external_source,external_id) VALUES ('missing','a','branch-a','MISSING','whatsapp_order_request','request-a'),('foreign','a','branch-a','FOREIGN','whatsapp_order_request','request-b'),('other-source','a','branch-a','OTHER','shopify','request-a')",
    );
    await client.execute(
      "INSERT INTO commerce_orders(id,organization_id,branch_id,order_number,external_source,external_id,customer_name,customer_phone) VALUES ('filled','a','branch-a','FILLED','whatsapp_order_request','unmapped','Existing name','+61400000009')",
    );
    for (const statement of readFileSync(
      "drizzle/0106_sturdy_the_santerians.sql",
      "utf8",
    ).split("--> statement-breakpoint"))
      if (statement.trim()) await client.execute(statement);
    const result = await client.execute(
      "SELECT id,customer_phone,customer_name,contact_id FROM commerce_orders ORDER BY id",
    );
    expect(result.rows.find((row) => row.id === "missing")).toMatchObject({
      customer_phone: "+61400000001",
      customer_name: "Sample Customer",
      contact_id: "person-a",
    });
    expect(result.rows.find((row) => row.id === "filled")).toMatchObject({
      customer_name: "Existing name",
      customer_phone: "+61400000009",
    });
    expect(result.rows.find((row) => row.id === "foreign")).toMatchObject({
      customer_phone: null,
      customer_name: null,
      contact_id: null,
    });
    expect(result.rows.find((row) => row.id === "other-source")).toMatchObject({
      customer_phone: null,
      customer_name: null,
      contact_id: null,
    });
    expect(
      (
        await client.execute(
          "SELECT notification_state,notified_at FROM whatsapp_order_requests",
        )
      ).rows.every(
        (row) => row.notification_state === null && row.notified_at === null,
      ),
    ).toBe(true);
    const fk = await client.execute(
      "PRAGMA foreign_key_list(whatsapp_order_requests)",
    );
    expect(
      fk.rows.find((row) => row.from === "notification_message_id")?.on_delete,
    ).toBe("SET NULL");
  } finally {
    client.close();
  }
});
