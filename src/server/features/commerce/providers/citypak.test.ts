import { describe, it, expect, vi } from "vitest";
import {
  citypakStatus,
  citypakEventTime,
  createCitypakOrder,
  trackCitypakOrder,
  citypakLabel,
  parseCitypakCallback,
} from "./citypak";
describe("Citypak order boundaries", () => {
  it("keeps failed delivery distinct and reads Sri Lanka timestamps", () => {
    expect(citypakStatus("NOT DELIVERED")).toBe("NOT DELIVERED");
    expect(citypakStatus("RETURN TO MERCHANT")).toBe("RETURNED");
    expect(citypakEventTime("13-10-2026", "10:19:00")).toBe(
      "2026-10-13T04:49:00.000Z",
    );
    expect(citypakEventTime("nonsense", "10:19:00")).toBeNull();
  });
  it("requires a confirmed creation response, without retrying ambiguous results", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: "unknown" }), {
        status: 200,
      }),
    );
    await expect(
      createCitypakOrder("test-key", { reference: "SHOP-1" }, fetcher),
    ).rejects.toThrow("did not confirm");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.redirect).toBe("manual");
  });
  it("returns provider identity only when a waybill exists", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [{ order_id: 123, items: [{ tracking_number: "D123" }] }],
        }),
      ),
    );
    expect(
      await createCitypakOrder("test-key", { reference: "SHOP-1" }, fetcher),
    ).toEqual({ externalId: "123", trackingNumber: "D123" });
  });
  it("rejects non-PDF label responses and handles encoded tracking safely", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{error:true}", {
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(
      citypakLabel("test-key", "D/123", "4X6", fetcher),
    ).rejects.toThrow("unavailable");
    const input = fetcher.mock.calls[0][0];
    expect(typeof input).toBe("string");
    if (typeof input !== "string") throw new Error("Expected URL string");
    const url = new URL(input);
    expect(url.hostname).toBe("falcon.citypak.lk");
    expect(url.searchParams.get("tracking_numbers[]")).toBe("D/123");
  });
  it("preserves the source timestamp for tracking events", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            tracking_history: [
              {
                status_type: "NOT DELIVERED",
                date: "13-10-2026",
                time: "10:19:00",
              },
            ],
          },
        }),
      ),
    );
    const result = await trackCitypakOrder("test-key", "D123", fetcher);
    expect(result.events[0]).toMatchObject({
      status: "NOT DELIVERED",
      eventAt: "2026-10-13T04:49:00.000Z",
    });
  });
});

describe("Citypak legacy response and callback parity", () => {
  it.each([
    ["RTM", "DELIVERED", "RETURNED"],
    [" rtm ", "DELIVERED", "RETURNED"],
    ["DL", "DELIVERED", "DELIVERED"],
    ["UD", "NOT DELIVERED", "NOT DELIVERED"],
    ["UD", "OUT FOR DELIVERY", "OUT FOR DELIVERY"],
  ])("maps callback code %s and label %s to %s", (code, label, expected) => {
    const event = {
      tracking_number: "DTEST-RTM",
      status_type: code,
      status: label,
      delivered_datetime: "19-06-2024 13:30:59",
    };
    for (const payload of [event, [event], { events: [event] }])
      expect(parseCitypakCallback(payload)).toEqual([
        {
          trackingNumber: "DTEST-RTM",
          status: expected,
          reason: null,
          eventAt: "2024-06-19T08:00:59.000Z",
        },
      ]);
  });
  it.each([
    { status_type: "DELIVERED", status_code: "RTM" },
    { status_type: "RETURN TO MERCHANT", status_code: "RT" },
  ])(
    "does not classify a returned tracking result as delivered: %j",
    async (status) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            is_success: true,
            data: {
              is_delivered: true,
              tracking_history: [
                { ...status, date: "19-06-2024", time: "13:30:59" },
              ],
            },
          }),
        ),
      );
      const result = await trackCitypakOrder("test-key", "DTEST-RTM", fetcher);
      expect(result.delivered).toBe(false);
      expect(result.events).toEqual([
        {
          status: "RETURNED",
          reason: null,
          eventAt: "2024-06-19T08:00:59.000Z",
        },
      ]);
    },
  );
  it("uses the latest terminal tracking event when a returned parcel is later delivered", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          is_success: true,
          data: {
            is_delivered: true,
            tracking_history: [
              {
                status_type: "DELIVERED",
                status_code: "RTM",
                date: "19-06-2024",
                time: "13:30:59",
              },
              {
                status_type: "DELIVERED",
                status_code: "DL",
                date: "20-06-2024",
                time: "13:30:59",
              },
            ],
          },
        }),
      ),
    );
    const result = await trackCitypakOrder("test-key", "DTEST-RTM", fetcher);
    expect(result.delivered).toBe(true);
    expect(result.events.map((event) => event.status)).toEqual([
      "RETURNED",
      "DELIVERED",
    ]);
  });
  it("sanitizes contacts and accepts a direct provider tracking identity", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { order_id: 42, tracking_number: "D42" },
        }),
      ),
    );
    expect(
      await createCitypakOrder(
        "test-key",
        {
          reference: "SHOP-42",
          to_name: "Nimal සිං",
          from_address_line_1: "Colombo සිං",
          cash_on_delivery_amount: 25,
        },
        fetcher,
      ),
    ).toEqual({ trackingNumber: "D42", externalId: "42" });
    const body = fetcher.mock.calls[0][1]?.body;
    if (typeof body !== "string") throw new Error("Expected JSON request body");
    expect(JSON.parse(body)).toMatchObject({
      token: "test-key",
      to_name: "Nimal",
      from_address_line_1: "Colombo",
      cash_on_delivery_amount: 25,
    });
  });
  it("prefers the stored Citypak order ID when printing", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("pdf", { headers: { "content-type": "application/pdf" } }),
      );
    await citypakLabel("test-key", "D42", "A4", fetcher, "42");
    const input = fetcher.mock.calls[0][0];
    const url = new URL(input instanceof Request ? input.url : input);
    expect(url.pathname).toBe("/customer_api/v1/orders/42/waybills");
    expect(url.searchParams.get("per_page_waybill_count")).toBe("4");
  });
  it("accepts supported envelopes with stable Sri Lanka timestamps", () => {
    const event = {
      tracking_number: "D42",
      status_type: "RECEIVED IN FACILITY",
      action_datetime: "14-10-2026 10:00:00",
    };
    for (const payload of [event, [event], { events: [event] }])
      expect(parseCitypakCallback(payload)).toEqual([
        {
          trackingNumber: "D42",
          status: "IN TRANSIT",
          reason: null,
          eventAt: "2026-10-14T04:30:00.000Z",
        },
      ]);
    expect(() =>
      parseCitypakCallback({ ...event, status_type: "invented" }),
    ).toThrow();
    expect(() =>
      parseCitypakCallback({ ...event, action_datetime: undefined }),
    ).toThrow();
    expect(() =>
      parseCitypakCallback(Array.from({ length: 101 }, () => event)),
    ).toThrow();
  });
});
