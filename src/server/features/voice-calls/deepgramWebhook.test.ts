import { describe, expect, it } from "vitest";
import {
  analyseWebsiteCall,
  parseAnalysis,
  readWebsiteCall,
  websiteCallReport,
} from "./deepgramWebhook";

const delivery = {
  type: "website_call_ended",
  callId: "3f1c2a9e-8d7b-4c1a-9f0e-2b6d5a4c3e21",
  agentName: "Maya",
  site: "digitalurgency.lk",
  region: "LK",
  startedAt: "2026-09-18T09:30:00.000Z",
  durationSeconds: 142,
  endReason: "silence",
  transcript: [
    {
      role: "agent",
      message: "Thank you for calling DigitalUrgency, this is Maya.",
    },
    {
      role: "user",
      message: "Hi, I'm Nimal. I need a website. Call me on 0777 995 267.",
    },
    { role: "user", message: "  " },
  ],
};

function anthropicReply(text: string): typeof fetch {
  return async () =>
    new Response(JSON.stringify({ content: [{ type: "text", text }] }), {
      status: 200,
    });
}

describe("readWebsiteCall", () => {
  it("reads a finished website call", () => {
    const call = readWebsiteCall(delivery);
    expect(call?.agentName).toBe("Maya");
    expect(call?.region).toBe("LK");
  });

  it("refuses anything else", () => {
    expect(readWebsiteCall({ ...delivery, type: "ping" })).toBeNull();
    expect(readWebsiteCall({ ...delivery, endReason: "bored" })).toBeNull();
    expect(
      readWebsiteCall({
        ...delivery,
        transcript: [{ role: "system", message: "x" }],
      }),
    ).toBeNull();
  });
});

describe("parseAnalysis", () => {
  it("reads JSON inside a code fence and tolerates an odd outcome", () => {
    const analysis = parseAnalysis(
      '```json\n{"summary":"Wants a site.","call_successful":"maybe","caller_name":"Nimal"}\n```',
    );
    expect(analysis?.caller_name).toBe("Nimal");
    expect(analysis?.call_successful).toBe("unknown");
  });

  it("returns null for prose", () => {
    expect(parseAnalysis("I could not read the call.")).toBeNull();
  });
});

describe("analyseWebsiteCall", () => {
  const call = readWebsiteCall(delivery);
  if (!call) throw new Error("fixture must parse");

  it("uses the model's reading when it has a key", async () => {
    const analysis = await analyseWebsiteCall(
      call,
      "key",
      anthropicReply(
        JSON.stringify({
          summary: "Nimal wants a website.",
          call_successful: "success",
          caller_name: "Nimal",
          service_interest: "Website",
          callback_details: "0777 995 267",
        }),
      ),
    );
    expect(analysis.summary).toBe("Nimal wants a website.");
    expect(analysis.service_interest).toBe("Website");
  });

  it("falls back to the number the caller said, read as Sri Lankan", async () => {
    const analysis = await analyseWebsiteCall(call, null);
    expect(analysis.summary).toBeNull();
    expect(analysis.callback_details).toBe("+94777995267");
  });

  it("does not call the model when the caller said nothing", async () => {
    let called = false;
    const silent = readWebsiteCall({
      ...delivery,
      transcript: [delivery.transcript[0]],
    });
    if (!silent) throw new Error("fixture must parse");
    await analyseWebsiteCall(silent, "key", async () => {
      called = true;
      return new Response("{}");
    });
    expect(called).toBe(false);
  });
});

describe("websiteCallReport", () => {
  it("shapes the call like a post-call report", () => {
    const call = readWebsiteCall(delivery);
    if (!call) throw new Error("fixture must parse");
    const report = websiteCallReport(call, {
      summary: " Nimal wants a website. ",
      call_successful: "success",
      caller_name: "Nimal",
      caller_email: "",
    });
    expect(report).toMatchObject({
      conversationId: delivery.callId,
      agentName: "Maya",
      direction: "website",
      callerNumber: null,
      summary: "Nimal wants a website.",
      region: "LK",
      captured: {
        caller_name: "Nimal",
        call_ended: "caller went silent for a minute",
      },
    });
    expect(report.captured.caller_email).toBeUndefined();
    // The blank turn is dropped.
    expect(report.transcript).toHaveLength(2);
  });
});
