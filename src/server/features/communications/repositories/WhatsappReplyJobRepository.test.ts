import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type * as ReplyJobsModule from "./WhatsappReplyJobRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let Jobs: typeof ReplyJobsModule.WhatsappReplyJobRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  await client.executeMultiple(`
    CREATE TABLE whatsapp_reply_jobs (
      conversation_id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL,
      latest_message_id TEXT NOT NULL,
      due_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      claim_expires_at TEXT,
      updated_at TEXT NOT NULL
    );
  `);
  ({ WhatsappReplyJobRepository: Jobs } =
    await import("./WhatsappReplyJobRepository"));
});

afterAll(() => {
  vi.useRealTimers();
  client.close();
});

beforeEach(async () => {
  await client.execute("DELETE FROM whatsapp_reply_jobs");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-04T10:00:00.000Z"));
});

describe("WhatsApp delayed reply jobs", () => {
  it("answers only after the latest message has been quiet for 30 seconds", async () => {
    await Jobs.schedule("org", "chat", "first", 30);
    vi.setSystemTime(new Date("2026-10-04T10:00:20.000Z"));
    await Jobs.schedule("org", "chat", "second", 30);

    expect(await Jobs.claimDue(new Date("2026-10-04T10:00:31.000Z"))).toEqual(
      [],
    );
    const claimed = await Jobs.claimDue(new Date("2026-10-04T10:00:51.000Z"));
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.latestMessageId).toBe("second");
    expect(await Jobs.claimDue(new Date("2026-10-04T10:00:52.000Z"))).toEqual(
      [],
    );
  });

  it("does not delete a newer reply when an older claimed reply finishes", async () => {
    await Jobs.schedule("org", "chat", "first", 30);
    const claimed = await Jobs.claimDue(new Date("2026-10-04T10:00:31.000Z"));
    expect(claimed).toHaveLength(1);

    vi.setSystemTime(new Date("2026-10-04T10:00:32.000Z"));
    await Jobs.schedule("org", "chat", "second", 30);
    await Jobs.finish("chat", "first");

    const next = await Jobs.claimDue(new Date("2026-10-04T10:01:03.000Z"));
    expect(next).toHaveLength(1);
    expect(next[0]?.latestMessageId).toBe("second");
  });
});
