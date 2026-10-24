import { readFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { expect, it } from "vitest";
it("preserves history, starts disabled and links only previously claimed same-workspace test messages", async () => {
  const client = createClient({ url: ":memory:" });
  try {
    await client.executeMultiple(
      "PRAGMA foreign_keys=ON; CREATE TABLE organization(id text primary key); CREATE TABLE integration_connections(id text primary key); CREATE TABLE whatsapp_connections(id text primary key); CREATE TABLE whatsapp_messages(id text primary key,organization_id text); CREATE TABLE voice_phone_calls(id text primary key,organization_id text,external_conversation_id text); INSERT INTO voice_phone_calls VALUES ('historical','org','existing'),('test-call','org','explicit-test'),('foreign-call','org','foreign'); INSERT INTO whatsapp_messages VALUES ('voice-book-link:test-call','org'),('voice-book-link:foreign-call','other');",
    );
    for (const file of [
      "drizzle/0111_new_blackheart.sql",
      "drizzle/0112_bored_boomerang.sql",
    ])
      await client.executeMultiple(readFileSync(file, "utf8"));
    expect(
      (
        await client.execute(
          "SELECT * FROM voice_phone_calls WHERE id='historical'",
        )
      ).rows,
    ).toEqual([
      {
        id: "historical",
        organization_id: "org",
        external_conversation_id: "existing",
        book_link_status: null,
        book_link_message_id: null,
      },
    ]);
    expect(
      (
        await client.execute(
          "SELECT book_link_message_id FROM voice_phone_calls WHERE id='test-call'",
        )
      ).rows[0].book_link_message_id,
    ).toBe("voice-book-link:test-call");
    expect(
      (
        await client.execute(
          "SELECT book_link_message_id FROM voice_phone_calls WHERE id='foreign-call'",
        )
      ).rows[0].book_link_message_id,
    ).toBeNull();
    await client.executeMultiple(
      "INSERT INTO organization VALUES ('org'); INSERT INTO integration_connections VALUES ('voice'); INSERT INTO voice_book_link_settings (connection_id,organization_id) VALUES ('voice','org');",
    );
    expect(
      (
        await client.execute(
          "SELECT enabled,started_at FROM voice_book_link_settings",
        )
      ).rows,
    ).toEqual([{ enabled: 0, started_at: null }]);
    await client.execute(
      "DELETE FROM whatsapp_messages WHERE id='voice-book-link:test-call'",
    );
    expect(
      (
        await client.execute(
          "SELECT book_link_message_id FROM voice_phone_calls WHERE id='test-call'",
        )
      ).rows[0].book_link_message_id,
    ).toBeNull();
  } finally {
    client.close();
  }
});
