import { sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { organization } from "./better-auth-schema";

// Same expression app.schema uses: text timestamps that sort the way
// `new Date().toISOString()` does.
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// Client accounts: the agency's register of who its clients are, which
// workspace each one's data lives in, and which phone numbers have proved they
// speak for that client.
//
// `organizationId` is the AGENCY's workspace. `clientOrganizationId` is the
// client's own, and every read across that boundary goes through a service
// that checks a row here first. It is the one place in the app where one
// organization may see another's data, so it is written down rather than
// inferred.
export const clientAccounts = pgTable(
  "client_accounts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientOrganizationId: text("client_organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** What the agency calls them, which may differ from the workspace name. */
    displayName: text("display_name").notNull(),
    /** active | paused — paused refuses verification without losing history. */
    status: text("status").notNull().default("active"),
    // The code is stored the way a password is: derived, salted, never
    // recoverable. Losing it costs one rotation, which is cheaper than a
    // readable secret sitting in a database.
    codeHash: text("code_hash"),
    codeSalt: text("code_salt"),
    /** Shown in the UI so a code can be told apart without revealing it. */
    codeHint: text("code_hint"),
    codeIssuedAt: text("code_issued_at"),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("client_accounts_org_client_idx").on(
      table.organizationId,
      table.clientOrganizationId,
    ),
    index("client_accounts_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
  ],
);

// A channel identity that has proved, once, that it speaks for a client.
// After that the identity is the credential and the code is never asked again.
export const clientContacts = pgTable(
  "client_contacts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientAccountId: text("client_account_id")
      .notNull()
      .references(() => clientAccounts.id, { onDelete: "cascade" }),
    /** whatsapp today; the column exists so email or SMS need no migration. */
    channel: text("channel").notNull().default("whatsapp"),
    /** Phone in E.164, or whatever identifies the person on that channel. */
    identifier: text("identifier").notNull(),
    displayName: text("display_name"),
    verifiedAt: text("verified_at").notNull().default(isoNow),
    // Revoking leaves the row so the access log still reads correctly.
    revokedAt: text("revoked_at"),
    lastSeenAt: text("last_seen_at"),
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("client_contacts_channel_identifier_idx").on(
      table.channel,
      table.identifier,
    ),
    index("client_contacts_account_idx").on(table.clientAccountId),
  ],
);

// Every attempt and every lookup, so "who saw my data?" has an answer.
export const clientAccessEvents = pgTable(
  "client_access_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Null when a failed attempt could not be matched to an account, which is
    // itself worth recording.
    clientAccountId: text("client_account_id").references(
      () => clientAccounts.id,
      { onDelete: "set null" },
    ),
    channel: text("channel").notNull().default("whatsapp"),
    identifier: text("identifier").notNull(),
    /** verified | rejected | locked | lookup | revoked | rotated */
    kind: text("kind").notNull(),
    detail: text("detail"),
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    index("client_access_events_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("client_access_events_identifier_idx").on(
      table.identifier,
      table.createdAt,
    ),
  ],
);
