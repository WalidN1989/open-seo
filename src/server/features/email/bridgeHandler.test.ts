import { beforeEach, describe, expect, it, vi } from "vitest";

const ingest = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const accountsForBridge = vi.fn<() => Promise<unknown>>();
vi.mock("./services/MailboxIngestService", () => ({
  MailboxIngestService: {
    ingest: (...args: unknown[]) => ingest(...args),
    accountsForBridge: () => accountsForBridge(),
    setCursor: vi.fn(),
  },
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: (name: string) =>
    Promise.resolve(name === "INTERNAL_CRON_SECRET" ? "s3cret" : undefined),
}));

const { handleMailBridgeRequest } = await import("./bridgeHandler");

function post(path: string, body: unknown, secret?: string) {
  return new Request(`http://worker${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-internal-cron-secret": secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("mail bridge handler", () => {
  beforeEach(() => {
    ingest.mockReset();
    accountsForBridge.mockReset();
  });

  it("refuses without the shared secret", async () => {
    const response = await handleMailBridgeRequest(
      post("/api/internal/mailbox/accounts", {}),
    );
    expect(response.status).toBe(401);
    expect(accountsForBridge).not.toHaveBeenCalled();
  });

  it("lists mailboxes for the bridge with the secret", async () => {
    accountsForBridge.mockResolvedValue([{ accountId: "a1" }]);
    const response = await handleMailBridgeRequest(
      post("/api/internal/mailbox/accounts", {}, "s3cret"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accounts: [{ accountId: "a1" }] });
  });

  it("rejects a malformed batch before touching the service", async () => {
    const response = await handleMailBridgeRequest(
      post("/api/internal/mailbox/ingest", { accountId: "a1" }, "s3cret"),
    );
    expect(response.status).toBe(400);
    expect(ingest).not.toHaveBeenCalled();
  });

  it("hands a well-formed batch to the ingest service", async () => {
    ingest.mockResolvedValue({ accepted: 1, cursor: "12" });
    const message = {
      uid: 12,
      messageId: "<m@x>",
      inReplyTo: null,
      references: [],
      from: "Jane <jane@x.com>",
      to: ["sales@digitalurgency.com.au"],
      subject: "Re: Your report",
      text: "Thanks!",
      html: null,
      date: "2026-09-13T10:00:00.000Z",
    };
    const response = await handleMailBridgeRequest(
      post(
        "/api/internal/mailbox/ingest",
        { accountId: "a1", messages: [message] },
        "s3cret",
      ),
    );
    expect(response.status).toBe(200);
    expect(ingest).toHaveBeenCalledWith("a1", [message]);
  });
});
