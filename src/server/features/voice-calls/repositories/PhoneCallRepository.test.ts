import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import * as schema from "@/db/business.schema";
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@/db/schema", async () => import("@/db/business.schema"));
import { PhoneCallRepository } from "./PhoneCallRepository";
const client = createClient({ url: ":memory:" });
beforeAll(async () => {
  state.db = drizzle(client);
  for (const table of [
    schema.voicePhoneCalls,
    schema.voiceCaseCalls,
    schema.whatsappMessages,
    schema.crmContacts,
    schema.crmLeads,
    schema.businessSettings,
  ]) {
    const config = getTableConfig(table);
    await client.execute(
      `create table "${config.name}" (${config.columns.map((column) => `"${column.name}" ${column.getSQLType()}`).join(",")})`,
    );
  }
  await client.execute(
    "insert into crm_contacts (id,organization_id,first_name) values ('foreign-contact','org-b','Private')",
  );
  await client.execute(
    "insert into business_settings (id,organization_id,currency) values ('settings-a','org-a','LKR'),('settings-b','org-b','AUD')",
  );
  await client.execute(
    "insert into crm_leads (id,organization_id,title) values ('foreign-lead','org-b','Private lead')",
  );
  await client.execute(
    "insert into voice_phone_calls (id,organization_id,started_at,created_at,contact_id,lead_id) values ('old','org-a','2026-09-01T00:00:00.000Z','2026-10-12T00:00:00.000Z',null,null),('recent','org-a','2026-10-11T00:00:00.000Z','2026-10-11T00:00:00.000Z','foreign-contact','foreign-lead'),('fallback','org-a',null,'2026-10-10T00:00:00.000Z',null,null),('other','org-b','2026-10-12T00:00:00.000Z','2026-10-12T00:00:00.000Z',null,null)",
  );
});
afterAll(() => {
  client.close();
});
describe("call repository tenant and time filters", () => {
  it("uses only the connection's workspace for the default phone region", async () => {
    expect(await PhoneCallRepository.defaultPhoneRegion("org-a")).toBe("LK");
    expect(await PhoneCallRepository.defaultPhoneRegion("org-b")).toBe("AU");
    expect(await PhoneCallRepository.defaultPhoneRegion("org-empty")).toBe(
      "AU",
    );
  });
  it("orders by start time, uses creation only when start is absent, and bounds rows", async () => {
    expect(
      (await PhoneCallRepository.listCalls("org-a", 2)).map(
        (row) => row.call.id,
      ),
    ).toEqual(["recent", "fallback"]);
  });
  it("filters by the actual start time rather than late webhook delivery", async () => {
    expect(
      (
        await PhoneCallRepository.listCalls("org-a", 10, {
          since: "2026-10-09T00:00:00.000Z",
        })
      ).map((row) => row.call.id),
    ).toEqual(["recent", "fallback"]);
  });
  it("does not return a call belonging to another workspace", async () => {
    expect(
      await PhoneCallRepository.listCalls("org-a", 1, { callId: "other" }),
    ).toEqual([]);
  });
  it("does not join CRM records from a different organization", async () => {
    const [row] = await PhoneCallRepository.listCalls("org-a", 1, {
      callId: "recent",
    });
    expect(row?.contact).toBeNull();
    expect(row?.lead).toBeNull();
  });
});

it("shows live message delivery status only for a message in the same workspace", async () => {
  await client.execute(
    "INSERT INTO whatsapp_messages (id,organization_id,status) VALUES ('foreign-message','org-b','read'),('owned-message','org-a','delivered')",
  );
  await client.execute(
    "UPDATE voice_phone_calls SET book_link_message_id='foreign-message' WHERE id='recent'",
  );
  await client.execute(
    "UPDATE voice_phone_calls SET book_link_message_id='owned-message' WHERE id='fallback'",
  );
  const rows = await PhoneCallRepository.listCalls("org-a");
  expect(
    rows.find((row) => row.call.id === "recent")?.bookLinkMessage,
  ).toBeNull();
  expect(
    rows.find((row) => row.call.id === "fallback")?.bookLinkMessage?.status,
  ).toBe("delivered");
  await client.execute(
    "UPDATE whatsapp_messages SET status='read' WHERE id='owned-message'",
  );
  expect(
    (await PhoneCallRepository.listCalls("org-a")).find(
      (row) => row.call.id === "fallback",
    )?.bookLinkMessage?.status,
  ).toBe("read");
});

it("keeps inbound conflicts fatal, while outbound storage can safely deduplicate", async () => {
  await client.execute(
    "CREATE UNIQUE INDEX fixture_phone_org_conv ON voice_phone_calls(organization_id, external_conversation_id)",
  );
  const row = {
    id: "insert-once",
    organizationId: "org-a",
    externalConversationId: "insert-test",
    provider: "elevenlabs",
  };
  await PhoneCallRepository.insertCall(row);
  await expect(
    PhoneCallRepository.insertCall({ ...row, id: "second-inbound" }),
  ).rejects.toThrow();
  expect(
    (
      await PhoneCallRepository.insertCall(
        { ...row, id: "second-outbound" },
        { deduplicate: true },
      )
    ).id,
  ).toBe("insert-once");
});
