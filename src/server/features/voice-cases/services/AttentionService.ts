import { z } from "zod";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { attentionInputSchema } from "@/types/schemas/voiceCases";
import { AttentionRepository as Repo } from "../repositories/AttentionRepository";
import {
  decodeAttentionCursor,
  encodeAttentionCursor,
  reportedBoolean,
  shortAttentionText,
} from "../attentionCursor";

const capturedSchema = z.record(z.string(), z.unknown());
function reported(json: string) {
  try {
    return capturedSchema.parse(JSON.parse(json));
  } catch {
    return {};
  }
}
function waited(at: string | null) {
  return at
    ? Math.max(0, Math.floor((Date.now() - Date.parse(at)) / 60_000)) || 0
    : null;
}
function callOutsideRange(
  direction: string | null,
  at: string,
  since: string | null,
) {
  return (
    direction === "outbound" ||
    Boolean(since && Date.parse(at) < Date.parse(since))
  );
}
function smsWaiting(row: {
  status: string;
  optedOutAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
}) {
  return (
    !["resolved", "closed"].includes(row.status) &&
    !row.optedOutAt &&
    Boolean(
      row.lastInboundAt &&
      (!row.lastOutboundAt ||
        Date.parse(row.lastInboundAt) > Date.parse(row.lastOutboundAt)),
    )
  );
}
type Item = {
  kind: string;
  id: string;
  state: "attention" | "cleared";
  name?: string | null;
  phone?: string | null;
  reason?: string;
  resolved?: string;
  callbackNeeded?: string;
  lastMessage?: string;
  waitedMinutes?: number | null;
  status?: string;
  readyToClose?: boolean;
  readyReason?: string | null;
};
async function get(
  organizationId: string,
  userId: string,
  raw: z.infer<typeof attentionInputSchema>,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "voice");
  const access = await BusinessModuleService.getAccess(organizationId, userId);
  const permitted = new Set(
    access.filter((a) => a.enabled && a.permission).map((a) => a.key),
  );
  const modules = [
    "voice",
    ...(permitted.has("whatsapp") ? ["whatsapp"] : []),
    ...(permitted.has("sms") ? ["sms"] : []),
  ]
    .toSorted()
    .join(",");
  const input = attentionInputSchema.parse(raw);
  const since = input.since ? new Date(input.since).toISOString() : undefined;
  const cursor = input.cursor
    ? decodeAttentionCursor(input.cursor, organizationId, modules, since)
    : {
        v: 1 as const,
        org: organizationId,
        modules,
        since: since ?? null,
        revision: 0,
        until: null,
        initial: true,
      };
  const head = await Repo.head(organizationId);
  const until = cursor.until ?? head;
  const changes = await Repo.changes(organizationId, cursor.revision, until);
  const ids = (kind: string) =>
    changes.filter((c) => c.kind === kind).map((c) => c.entityId);
  const [calls, cases, whatsapp, sms] = await Promise.all([
    Repo.calls(organizationId, ids("call")),
    Repo.cases(organizationId, ids("case")),
    permitted.has("whatsapp")
      ? Repo.whatsapp(organizationId, ids("whatsapp"))
      : [],
    permitted.has("sms") ? Repo.sms(organizationId, ids("sms")) : [],
  ]);
  const values = new Map<string, { item: Item; at: string | null }>();
  for (const row of calls) {
    if (
      callOutsideRange(
        row.direction,
        row.startedAt ?? row.createdAt,
        cursor.since,
      )
    )
      continue;
    const fields = reported(row.capturedJson);
    const resolved = reportedBoolean(fields.resolved ?? fields.issue_resolved);
    const callbackNeeded = reportedBoolean(
      fields.callback_needed ?? fields.callback_required,
    );
    values.set(`call:${row.id}`, {
      at: row.startedAt ?? row.createdAt,
      item: {
        kind: "call",
        id: row.id,
        state:
          resolved === "yes" && callbackNeeded === "no"
            ? "cleared"
            : "attention",
        name: row.name,
        phone: row.phone,
        reason: shortAttentionText(row.summary),
        resolved,
        callbackNeeded,
      },
    });
  }
  for (const row of cases)
    values.set(`case:${row.id}`, {
      at: row.updatedAt,
      item: {
        kind: "case",
        id: row.id,
        state: row.status === "closed" ? "cleared" : "attention",
        name: row.name,
        reason: shortAttentionText(row.reason),
        status: row.status,
        readyToClose: row.readyToClose,
        readyReason: row.readyReason,
      },
    });
  for (const row of whatsapp)
    values.set(`whatsapp:${row.id}`, {
      at: row.at,
      item: {
        kind: "whatsapp",
        id: row.id,
        state: row.status === "pending" ? "attention" : "cleared",
        name: row.name,
        phone: row.phone,
        lastMessage: shortAttentionText(row.body),
        waitedMinutes: waited(row.at),
      },
    });
  for (const row of sms)
    values.set(`sms:${row.id}`, {
      at: row.lastInboundAt,
      item: {
        kind: "sms",
        id: row.id,
        state: smsWaiting(row) ? "attention" : "cleared",
        name: row.name,
        phone: row.phone,
        lastMessage: shortAttentionText(row.body),
        waitedMinutes: waited(row.lastInboundAt),
      },
    });
  const items: Item[] = [];
  let revision = cursor.revision;
  for (const change of changes) {
    revision = change.revision;
    const value = values.get(`${change.kind}:${change.entityId}`);
    if (!value) continue;
    if (
      cursor.initial &&
      (value.item.state === "cleared" ||
        (cursor.since &&
          value.at &&
          Date.parse(value.at) < Date.parse(cursor.since)))
    )
      continue;
    // Delta clears contain only identity, avoiding needless customer text.
    items.push(
      value.item.state === "cleared"
        ? { kind: value.item.kind, id: value.item.id, state: "cleared" }
        : value.item,
    );
    if (items.length === input.limit) break;
  }
  const more = changes.length > 0 && revision < until;
  const next = encodeAttentionCursor({
    ...cursor,
    revision: more ? revision : until,
    until: more ? until : null,
    initial: more ? cursor.initial : false,
  });
  return { items, cursor: next, ...(more ? { hasMore: true } : {}) };
}
export const AttentionService = { get };
