import { describe, expect, it } from "vitest";
import {
  normalisePhone,
  readPostCall,
  verifyElevenLabsSignature,
} from "./elevenlabsWebhook";

async function sign(secret: string, timestamp: number, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  return [...new Uint8Array(mac)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

describe("verifyElevenLabsSignature", () => {
  const secret = "wsec_test";
  const body = '{"type":"post_call_transcription"}';
  const now = 1_789_320_000;

  it("accepts a fresh, correctly signed delivery", async () => {
    const header = `t=${now},v0=${await sign(secret, now, body)}`;
    await expect(
      verifyElevenLabsSignature({
        secret,
        header,
        rawBody: body,
        nowSeconds: now,
      }),
    ).resolves.toBe(true);
  });

  it("accepts when any of several v0 signatures matches", async () => {
    const header = `t=${now},v0=deadbeef,v0=${await sign(secret, now, body)}`;
    await expect(
      verifyElevenLabsSignature({
        secret,
        header,
        rawBody: body,
        nowSeconds: now,
      }),
    ).resolves.toBe(true);
  });

  it("refuses a wrong secret, a changed body, a stale timestamp, no header", async () => {
    const good = await sign(secret, now, body);
    await expect(
      verifyElevenLabsSignature({
        secret: "other",
        header: `t=${now},v0=${good}`,
        rawBody: body,
        nowSeconds: now,
      }),
    ).resolves.toBe(false);
    await expect(
      verifyElevenLabsSignature({
        secret,
        header: `t=${now},v0=${good}`,
        rawBody: `${body} `,
        nowSeconds: now,
      }),
    ).resolves.toBe(false);
    await expect(
      verifyElevenLabsSignature({
        secret,
        header: `t=${now},v0=${good}`,
        rawBody: body,
        nowSeconds: now + 31 * 60,
      }),
    ).resolves.toBe(false);
    await expect(
      verifyElevenLabsSignature({
        secret,
        header: null,
        rawBody: body,
        nowSeconds: now,
      }),
    ).resolves.toBe(false);
  });
});

describe("normalisePhone", () => {
  it("keeps international numbers and reads local Australian ones", () => {
    expect(normalisePhone("+971 50 133 5775")).toBe("+971501335775");
    expect(normalisePhone("0408 579 044")).toBe("+61408579044");
    expect(normalisePhone("0061408579044")).toBe("+61408579044");
    expect(normalisePhone("12")).toBeNull();
    expect(normalisePhone(undefined)).toBeNull();
  });
});

describe("readPostCall", () => {
  it("reads caller, captured fields, summary and transcript", () => {
    const report = readPostCall({
      type: "post_call_transcription",
      event_timestamp: 1_789_320_100,
      data: {
        agent_id: "agent_1",
        agent_name: "Digital Urgency",
        conversation_id: "conv_1",
        transcript: [
          {
            role: "agent",
            message: "Hello, this is Alex.",
            time_in_call_secs: 0,
          },
          {
            role: "user",
            message: "I need Google Maps SEO.",
            time_in_call_secs: 4,
          },
          { role: "agent", message: null, time_in_call_secs: 6 },
        ],
        metadata: {
          start_time_unix_secs: 1_789_320_000,
          call_duration_secs: 95,
          phone_call: {
            direction: "inbound",
            external_number: "+971501335775",
            agent_number: "+19412974258",
          },
        },
        analysis: {
          transcript_summary: "Mohammed wants Google Maps SEO.",
          call_successful: "success",
          data_collection_results: {
            caller_name: { value: "Mohammed Hestikar", rationale: "said so" },
            business_name: { value: "Southside Fencing" },
            caller_suburb: { value: null },
          },
        },
      },
    });
    expect(report).not.toBeNull();
    expect(report?.callerNumber).toBe("+971501335775");
    expect(report?.calledNumber).toBe("+19412974258");
    expect(report?.durationSeconds).toBe(95);
    expect(report?.captured).toEqual({
      caller_name: "Mohammed Hestikar",
      business_name: "Southside Fencing",
    });
    expect(report?.transcript).toHaveLength(2);
    expect(report?.startedAt).toBe(new Date(1_789_320_000_000).toISOString());
  });

  it("falls back to the caller id dynamic variable", () => {
    const report = readPostCall({
      type: "post_call_transcription",
      data: {
        conversation_id: "conv_2",
        conversation_initiation_client_data: {
          dynamic_variables: { system__caller_id: "0408579044" },
        },
      },
    });
    expect(report?.callerNumber).toBe("+61408579044");
  });

  it("ignores other event types", () => {
    expect(
      readPostCall({ type: "post_call_audio", data: { conversation_id: "c" } }),
    ).toBeNull();
  });
});
