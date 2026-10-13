import { afterEach, expect, it, vi } from "vitest";
type Handler = (input: {
  params: { connectionId: string };
  request: Request;
}) => Promise<Response>;
const state = vi.hoisted(() => ({
  handler: null as Handler | null,
  webhook: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    () => (options: { server: { handlers: { POST: Handler } } }) => {
      state.handler = options.server.handlers.POST;
      return {};
    },
}));
vi.mock("@/server/features/commerce/services/ShopifyOrderService", () => ({
  ShopifyOrderService: { webhook: state.webhook },
}));
afterEach(() => vi.restoreAllMocks());
it.each(["42P18", "sensitive credential or customer data"])(
  "logs only a safe database code for %s",
  async (code) => {
    const logger = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    state.webhook.mockRejectedValueOnce(
      new Error("sensitive provider payload", {
        cause: { code, query: "private query and customer parameters" },
      }),
    );
    await import("@/routes/api/shopify/$connectionId");
    if (!state.handler) throw new Error("Receiver handler not loaded");
    const response = await state.handler({
      params: { connectionId: "synthetic" },
      request: new Request("https://example.test/api/shopify/synthetic", {
        method: "POST",
        body: "{}",
      }),
    });
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
    expect(logger).toHaveBeenCalledWith("Shopify order ingestion failed", {
      code: code === "42P18" ? code : "unknown",
    });
    expect(JSON.stringify(logger.mock.calls)).not.toMatch(
      /sensitive|private|credential|customer/,
    );
  },
);
