import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("preserves existing Manual/Auto chats, messages and jobs on upgrade", async () => {
  const client = createClient({ url: ":memory:" });
  try {
    await client.executeMultiple(`
      CREATE TABLE whatsapp_conversations (id TEXT PRIMARY KEY, reply_mode TEXT);
      CREATE TABLE whatsapp_messages (id TEXT PRIMARY KEY, body TEXT);
      CREATE TABLE whatsapp_reply_jobs (conversation_id TEXT PRIMARY KEY, latest_message_id TEXT);
      INSERT INTO whatsapp_conversations VALUES ('manual-chat','manual'),('auto-chat','auto');
      INSERT INTO whatsapp_messages VALUES ('old-message','Preserve the conversation');
      INSERT INTO whatsapp_reply_jobs VALUES ('auto-chat','old-message');
    `);
    for (const statement of readFileSync(
      "drizzle/0109_loose_kid_colt.sql",
      "utf8",
    ).split("--> statement-breakpoint")) {
      if (statement.trim()) await client.execute(statement);
    }
    expect(
      (await client.execute("SELECT * FROM whatsapp_conversations ORDER BY id"))
        .rows,
    ).toEqual([
      {
        id: "auto-chat",
        reply_mode: "auto",
        reply_revision: 0,
        last_auto_reply_key: null,
      },
      {
        id: "manual-chat",
        reply_mode: "manual",
        reply_revision: 0,
        last_auto_reply_key: null,
      },
    ]);
    expect(
      (await client.execute("SELECT * FROM whatsapp_messages")).rows,
    ).toEqual([
      {
        id: "old-message",
        body: "Preserve the conversation",
        auto_reply_revision: null,
      },
    ]);
    expect(
      (await client.execute("SELECT * FROM whatsapp_reply_jobs")).rows,
    ).toEqual([
      {
        conversation_id: "auto-chat",
        latest_message_id: "old-message",
        reply_revision: 0,
      },
    ]);
  } finally {
    client.close();
  }
});
