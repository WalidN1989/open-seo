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
  const response = await fetcher(`${base}orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, token: apiKey }),
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  const parsed = z
    .object({
      success: z.literal(true),
      data: z
        .array(
          z.object({
            order_id: z.union([z.string(), z.number()]).optional(),
            items: z
              .array(z.object({ tracking_number: z.string().min(1) }))
              .min(1),
          }),
        )
        .min(1),
    })
    .safeParse(await response.json());
  if (!response.ok || !parsed.success)
    throw new Error(
      "Citypak did not confirm waybill creation. Check its order reference before retrying.",
    );
  return {
    trackingNumber: parsed.data.data[0].items[0].tracking_number,
    externalId: parsed.data.data[0].order_id?.toString() ?? null,
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
) {
  const url = new URL(`${base}waybills`);
  url.searchParams.set("tracking_numbers[]", trackingNumber);
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
