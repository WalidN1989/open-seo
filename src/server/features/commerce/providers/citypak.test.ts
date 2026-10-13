import { describe, it, expect, vi } from "vitest";
import {
  citypakStatus,
  citypakEventTime,
  createCitypakOrder,
  trackCitypakOrder,
  citypakLabel,
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
