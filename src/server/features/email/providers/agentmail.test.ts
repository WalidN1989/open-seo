import { describe, expect, it } from "vitest";
import {
  type AgentmailError,
  addressOf,
  agentmailClient,
  parseAgentmailEvent,
  verifyAgentmailSignature,
} from "./agentmail";

async function sign(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
) {
  const raw = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) =>
    c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

const SECRET = "whsec_" + btoa("a-very-secret-signing-key-of-32b");

describe("verifyAgentmailSignature", () => {
  it("accepts a fresh, correctly signed body and rejects a tampered one", async () => {
    const body = JSON.stringify({ event_type: "message.received" });
    const now = 1_700_000_000_000;
    const timestamp = String(Math.floor(now / 1000));
    const signature = await sign(SECRET, "msg_1", timestamp, body);
    const headers = new Headers({
      "svix-id": "msg_1",
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature} v1,otherkeysig==`,
    });
    await expect(
      verifyAgentmailSignature({ secret: SECRET, headers, rawBody: body, now }),
    ).resolves.toBe(true);
    await expect(
      verifyAgentmailSignature({
        secret: SECRET,
        headers,
        rawBody: body + " ",
        now,
      }),
    ).resolves.toBe(false);
  });

  it("rejects a stale timestamp even when the signature is right", async () => {
    const body = "{}";
    const timestamp = "1700000000";
    const signature = await sign(SECRET, "msg_2", timestamp, body);
    const headers = new Headers({
      "svix-id": "msg_2",
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    });
    await expect(
      verifyAgentmailSignature({
        secret: SECRET,
        headers,
        rawBody: body,
        now: 1_700_001_000_000,
      }),
    ).resolves.toBe(false);
  });
});

describe("agentmailClient", () => {
  it("sends the bearer key and surfaces provider errors with status and path only", async () => {
    const seen: { url?: string; auth?: string | null; body?: string } = {};
    const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
      seen.url = url instanceof Request ? url.url : url.toString();
      seen.auth = new Headers(init?.headers).get("authorization");
      seen.body = typeof init?.body === "string" ? init.body : "";
      return new Response(JSON.stringify({ message: "inbox not found" }), {
        status: 404,
      });
    }) as typeof fetch;
    const client = agentmailClient("am_secret_key", fetcher);
    await expect(
      client.sendMessage("inbox_1", { to: ["a@b.c"], text: "hi" }),
    ).rejects.toMatchObject({ status: 404 } satisfies Partial<AgentmailError>);
    expect(seen.url).toBe(
      "https://api.agentmail.to/v0/inboxes/inbox_1/messages/send",
    );
    expect(seen.auth).toBe("Bearer am_secret_key");
    expect(seen.body).toContain('"to":["a@b.c"]');
    try {
      await client.sendMessage("inbox_1", { to: ["a@b.c"], text: "hi" });
    } catch (error) {
      expect(String(error)).not.toContain("am_secret_key");
      expect(String(error)).toContain("inbox not found");
    }
  });
});

describe("event parsing", () => {
  it("reads the documented received payload and extracts bare addresses", () => {
    const event = parseAgentmailEvent(
      JSON.stringify({
        type: "event",
        event_type: "message.received",
        event_id: "evt_1",
        message: {
          inbox_id: "inbox_1",
          thread_id: "thd_1",
          message_id: "<abc@agentmail.to>",
          timestamp: "2026-09-05T10:00:00Z",
          from: "Jane Doe <Jane@Example.com>",
          to: ["Support <support@agentmail.to>"],
          subject: "Question",
          text: "Hello",
        },
      }),
    );
    expect(event?.event_type).toBe("message.received");
    expect(addressOf("Jane Doe <Jane@Example.com>")).toBe("jane@example.com");
    expect(addressOf("plain@example.com")).toBe("plain@example.com");
    expect(parseAgentmailEvent("not json")).toBeNull();
  });
});
