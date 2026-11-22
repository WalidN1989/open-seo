import { readFileSync, readdirSync } from "node:fs";
import { createClient } from "@libsql/client";
import { expect, it } from "vitest";
it("adds research reports without changing existing business tables and cascades project deletion", async () => {
  const client = createClient({ url: "file::memory:" });
  try {
    for (const name of readdirSync("drizzle")
      .filter((n) => n.endsWith(".sql"))
      .toSorted())
      for (const statement of readFileSync(`drizzle/${name}`, "utf8")
        .split("--> statement-breakpoint")
        .filter((s) => s.trim()))
        await client.execute(statement);
    await client.execute("PRAGMA foreign_keys=ON");
    await client.execute(
      "INSERT INTO organization(id,name,slug,created_at) VALUES ('test-org','Test','test',1)",
    );
    await client.execute(
      "INSERT INTO projects(id,organization_id,name,slug) VALUES ('test-project','test-org','Test','test')",
    );
    await client.execute(
      "INSERT INTO report_templates(id,project_id,name,description,instructions,created_by,created_by_user_id) VALUES ('template','test-project','Weekly','Brief','Use evidence','Test agent','test-user')",
    );
    await client.execute(
      "INSERT INTO research_reports(id,project_id,title,summary,html,created_by,created_by_user_id,size_bytes,template_id) VALUES ('report','test-project','Test report','Summary','<html>Evidence</html>','Test agent','test-user',21,'template')",
    );
    const row = (
      await client.execute(
        "SELECT share_token,created_at FROM research_reports WHERE id='report'",
      )
    ).rows[0];
    expect(row?.share_token).toBeNull();
    expect(row?.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await client.execute("DELETE FROM report_templates WHERE id='template'");
    expect(
      (await client.execute("SELECT id FROM research_reports")).rows,
    ).toHaveLength(1);
    for (const name of [
      "client_reports",
      "commerce_orders",
      "quotes",
      "invoices",
    ])
      expect(
        (
          await client.execute({
            sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            args: [name],
          })
        ).rows,
      ).toHaveLength(1);
    await client.execute("DELETE FROM projects WHERE id='test-project'");
    expect(
      (await client.execute("SELECT id FROM research_reports")).rows,
    ).toHaveLength(0);
    expect(
      (await client.execute("PRAGMA foreign_key_check")).rows,
    ).toHaveLength(0);
  } finally {
    client.close();
  }
});
