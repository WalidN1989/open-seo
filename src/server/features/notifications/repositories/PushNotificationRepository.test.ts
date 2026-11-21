import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RepositoryModule from "./PushNotificationRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let client: Client;
let repository: typeof RepositoryModule.PushNotificationRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  vi.doMock("@/db", () => ({ db: drizzle(client) }));
  await client.executeMultiple(`
    CREATE TABLE push_subscriptions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL, auth TEXT NOT NULL,
      created_at TEXT DEFAULT (current_timestamp) NOT NULL,
      updated_at TEXT DEFAULT (current_timestamp) NOT NULL,
      disabled_at TEXT
    );
    CREATE TABLE push_notification_preferences (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, user_id TEXT NOT NULL,
      channel TEXT NOT NULL, enabled INTEGER DEFAULT true NOT NULL,
      created_at TEXT DEFAULT (current_timestamp) NOT NULL,
      updated_at TEXT DEFAULT (current_timestamp) NOT NULL,
      UNIQUE (organization_id, user_id, channel)
    );
  `);
  ({ PushNotificationRepository: repository } =
    await import("./PushNotificationRepository"));
});

afterAll(() => client.close());

describe("push subscription device limit", () => {
  it("keeps at most five active devices per user", async () => {
    for (let index = 0; index < 7; index += 1) {
      await repository.upsertSubscription("user-1", {
        endpoint: `https://fcm.googleapis.com/fcm/send/${index}`,
        p256dh: `key-${index}`,
        auth: `auth-${index}`,
      });
    }

    const active = await repository.listActiveSubscriptions("user-1");
    expect(active).toHaveLength(5);
    const rows = await client.execute(
      "SELECT endpoint FROM push_subscriptions WHERE user_id = 'user-1'",
    );
    expect(rows.rows).toHaveLength(5);
    expect(
      rows.rows.some(
        (row) => row.endpoint === "https://fcm.googleapis.com/fcm/send/6",
      ),
    ).toBe(true);
  });

  it("limits devices without limiting opted-in workspace users", async () => {
    for (let index = 0; index < 7; index += 1) {
      await repository.setPreference("org-1", `user-${index}`, true);
    }
    expect(await repository.listEnabledUserIds("org-1")).toHaveLength(7);

    await client.execute({
      sql: `INSERT INTO push_subscriptions
        (id, user_id, endpoint, p256dh, auth, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        "forced-sixth",
        "user-1",
        "https://fcm.googleapis.com/fcm/send/forced-sixth",
        "key",
        "auth",
        "9999-12-31T23:59:59.999Z",
      ],
    });
    expect(await repository.listActiveSubscriptions("user-1")).toHaveLength(5);
  });
});
