import { createClient } from "@libsql/client";
import { expect, it } from "vitest";
import { FRONTIER_CLAIM_SQL } from "./frontier-claim";
it("preserves sitemap capacity while allowing link-first discovery with spare budget", async () => {
  const db = createClient({ url: "file::memory:" });
  try {
    await db.execute(
      "CREATE TABLE frontier(url TEXT, depth INTEGER, in_sitemap INTEGER, source TEXT,state TEXT)",
    );
    for (const row of [
      ["start", 0, 0, "link"],
      ["tag", 1, 0, "link"],
      ["product", null, 1, "sitemap"],
    ])
      await db.execute({
        sql: "INSERT INTO frontier VALUES(?,?,?,?,'pending')",
        args: row,
      });
    const constrained = await db.execute({
      sql: FRONTIER_CLAIM_SQL,
      args: [0, 2],
    });
    expect(constrained.rows.map((r) => r.url)).toEqual(["start", "product"]);
    const spare = await db.execute({ sql: FRONTIER_CLAIM_SQL, args: [4, 2] });
    expect(spare.rows.map((r) => r.url)).toEqual(["start", "tag"]);
  } finally {
    db.close();
  }
});
