import { z } from "zod";
const base = "https://falcon.citypak.lk/customer_api/v1/";
export function citypakStatus(raw: string) {
  const value = raw.trim().toUpperCase();
  if (value.includes("NOT DELIVERED")) return "NOT DELIVERED";
  if (value.includes("RETURN") || value.includes("RTM")) return "RETURNED";
  if (value.includes("DELIVERED")) return "DELIVERED";
  if (value.includes("OUT FOR DELIVERY")) return "OUT FOR DELIVERY";
  if (value.includes("FIRST MILE") || value.includes("RECEIVE SCAN"))
    return "FIRST MILE RECEIVE SCAN";
  if (value.includes("RECEIVED IN FACILITY")) return "IN TRANSIT";
  return value || "UNKNOWN";
}
export function citypakEventTime(date?: string, time?: string) {
  const match = date?.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!match || !time || !/^\d{2}:\d{2}:\d{2}$/.test(time)) return null;
  const iso = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}T${time}+05:30`;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
export async function createCitypakOrder(
  apiKey: string,
  payload: Record<string, string | number>,
  fetcher: typeof fetch = fetch,
) {
  // Falcon rejects non-ASCII address/contact fields, as well as descriptions.
  const sanitized = Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      typeof value === "string"
        ? value
            .replace(/[^\x20-\x7E]+/g, "")
            .trim()
            .slice(0, key === "description" ? 128 : 250)
        : value,
    ]),
  );
  const response = await fetcher(`${base}orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...sanitized, token: apiKey }),
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  const item = z.object({
    order_id: z.union([z.string(), z.number()]).nullish(),
    tracking_number: z.string().min(1).optional(),
    items: z.array(z.object({ tracking_number: z.string().min(1) })).optional(),
  });
  const parsed = z
    .object({
      success: z.literal(true),
      data: z.union([item, z.array(item).min(1)]),
    })
    .safeParse(await response.json());
  const first = parsed.success
    ? Array.isArray(parsed.data.data)
      ? parsed.data.data[0]
      : parsed.data.data
    : null;
  const trackingNumber =
    first?.items?.[0]?.tracking_number || first?.tracking_number;
  if (!response.ok || !trackingNumber)
    throw new Error(
      "Citypak did not confirm waybill creation. Check its order reference before retrying.",
    );
  return {
    trackingNumber,
    externalId: first?.order_id?.toString() ?? null,
  };
}
export async function trackCitypakOrder(
  apiKey: string,
  trackingNumber: string,
  fetcher: typeof fetch = fetch,
) {
  const url = new URL(`${base}track`);
  url.searchParams.set("tracking_number", trackingNumber);
  const response = await fetcher(url.href, {
    headers: { Authorization: `Bearer ${apiKey}` },
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  const parsed = z
    .object({
      success: z.boolean().optional(),
      is_success: z.boolean().optional(),
      data: z.object({
        is_delivered: z.boolean().optional(),
        tracking_history: z
          .array(
            z.object({
              status_type: z.string().optional(),
              status: z.string().optional(),
              description: z.string().optional(),
              date: z.string().optional(),
              time: z.string().optional(),
            }),
          )
          .default([]),
      }),
    })
    .safeParse(await response.json());
  if (
    !response.ok ||
    !parsed.success ||
    !(parsed.data.success || parsed.data.is_success)
  )
    throw new Error(
      "Citypak tracking is unavailable; the previous status is retained.",
    );
  return {
    delivered: parsed.data.data.is_delivered,
    events: parsed.data.data.tracking_history.map((event) => ({
      status: citypakStatus(event.status_type || event.status || "UNKNOWN"),
      reason: event.description ?? null,
      eventAt: citypakEventTime(event.date, event.time),
    })),
  };
}

export async function citypakLabel(
  apiKey: string,
  trackingNumber: string,
  size: "A4" | "4X6",
  fetcher: typeof fetch = fetch,
  externalId?: string | null,
) {
  const url = new URL(
    externalId
      ? `${base}orders/${encodeURIComponent(externalId)}/waybills`
      : `${base}waybills`,
  );
  if (!externalId) url.searchParams.set("tracking_numbers[]", trackingNumber);
  url.searchParams.set("page_size", size);
  url.searchParams.set("per_page_waybill_count", size === "4X6" ? "1" : "4");
  const response = await fetcher(url.href, {
    headers: { Authorization: `Bearer ${apiKey}` },
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("pdf"))
    throw new Error("Citypak label is unavailable.");
  return response;
}

const callbackEventSchema = z.object({
  tracking_number: z.string().trim().min(1).max(80),
  status: z.string().max(120).optional(),
  status_type: z.string().max(120).optional(),
  reason: z.string().max(1000).nullish(),
  delivered_datetime: z.string().max(100).optional(),
  action_datetime: z.string().max(100).optional(),
});
const callbackEnvelope = z.union([
  z.array(callbackEventSchema).min(1).max(100),
  z.object({ events: z.array(callbackEventSchema).min(1).max(100) }),
  callbackEventSchema,
]);
const deliveryStates = new Set([
  "PENDING",
  "FIRST MILE RECEIVE SCAN",
  "DISPATCHED",
  "IN TRANSIT",
  "OUT FOR DELIVERY",
  "DELIVERED",
  "NOT DELIVERED",
  "RETURNED",
]);
export function parseCitypakCallback(payload: unknown) {
  const envelope = callbackEnvelope.parse(payload);
  const events = Array.isArray(envelope)
    ? envelope
    : "events" in envelope
      ? envelope.events
      : [envelope];
  return events.map((event) => {
    const status = citypakStatus(event.status || event.status_type || "");
    if (!deliveryStates.has(status))
      throw new Error("Unsupported Citypak status");
    const timestamp = event.delivered_datetime || event.action_datetime;
    const parts = timestamp?.trim().split(/\s+/);
    const eventAt = parts ? citypakEventTime(parts[0], parts[1]) : null;
    if (!eventAt) throw new Error("Invalid Citypak timestamp");
    return {
      trackingNumber: event.tracking_number,
      status,
      reason: event.reason || null,
      eventAt,
    };
  });
}
