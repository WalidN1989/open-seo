import { describe, expect, it, vi } from "vitest";
import { checkFitsmsConnection } from "./fitsms";
const credential = vi.hoisted(() => vi.fn(async () => "private-token"));
vi.mock("@/server/lib/connection-secrets", () => ({
  resolveConnectionCredential: credential,
}));
const connection = { credentialReference: null };

describe("FITSMS setup connection check", () => {
  it("uses only a read-only v4 GET and returns no customer history", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        status: "success",
        data: { messages: ["customer-private"] },
      }),
    );
    expect(await checkFitsmsConnection(connection, fetcher)).toBeUndefined();
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "https://app.fitsms.lk/api/v4/sms?page=1",
      expect.objectContaining({
        method: "GET",
        redirect: "manual",
        headers: {
          Authorization: "Bearer private-token",
          Accept: "application/json",
        },
      }),
    );
  });
  it.each([401, 403, 302, 429, 500])(
    "refuses HTTP %s without leaking the response",
    async (status) => {
      await expect(
        checkFitsmsConnection(connection, async () =>
          Response.json({ token: "private-token" }, { status }),
        ),
      ).rejects.toThrow("FITSMS connection check failed.");
    },
  );
  it.each([
    { status: "error", message: "private-token" },
    {},
    { status: "successfully-sent" },
  ])(
    "rejects a malformed or application-level error response",
    async (body) => {
      await expect(
        checkFitsmsConnection(connection, async () => Response.json(body)),
      ).rejects.toThrow("No SMS was sent.");
    },
  );
  it("sanitizes transport errors", async () => {
    await expect(
      checkFitsmsConnection(connection, async () => {
        throw new Error("private-token");
      }),
    ).rejects.toThrow("FITSMS connection check failed.");
  });
});
