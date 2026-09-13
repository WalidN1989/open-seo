import { describe, expect, it, vi } from "vitest";
import type { PhoneCallReport } from "./elevenlabsWebhook";
import {
  draftRecap,
  parseRecap,
  plainRecap,
  recapPrompt,
  withSignature,
} from "./callRecap";

function report(overrides: Partial<PhoneCallReport> = {}): PhoneCallReport {
  return {
    conversationId: "conv_1",
    agentId: null,
    agentName: "Alex",
    direction: "inbound",
    callerNumber: null,
    calledNumber: null,
    startedAt: null,
    durationSeconds: 120,
    summary: "The user asked about SEO citations.",
    callSuccessful: "success",
    captured: {
      caller_name: "Sarah Jones",
      business_name: "Oxley Plumbing",
      caller_suburb: "Oxley",
      service_interest: "SEO citations",
      callback_details: "0412 345 678, mornings",
    },
    transcript: [
      { role: "agent", message: "[warmly] Hello, this is Alex.", atSeconds: 0 },
      { role: "user", message: "Hi, I need citations.", atSeconds: 2 },
    ],
    ...overrides,
  };
}

const input = {
  report: report(),
  firstName: "Sarah",
  businessName: "Digital Urgency",
};

describe("parseRecap", () => {
  it("reads the subject and body markers", () => {
    const recap = parseRecap(
      "SUBJECT: Thanks for your call, Sarah\n===BODY===\nHi Sarah,\n\nThanks for calling about SEO citations for Oxley Plumbing today.",
    );
    expect(recap?.subject).toBe("Thanks for your call, Sarah");
    expect(recap?.body.startsWith("Hi Sarah,")).toBe(true);
  });

  it("refuses a reply without the format", () => {
    expect(parseRecap("Hi Sarah, thanks for calling.")).toBeNull();
  });
});

describe("recapPrompt", () => {
  it("drops the agent's voice cues from the transcript", () => {
    const prompt = recapPrompt(input);
    expect(prompt).toContain("Receptionist: Hello, this is Alex.");
    expect(prompt).not.toContain("[warmly]");
  });
});

describe("plainRecap", () => {
  it("lists only what was captured", () => {
    const recap = plainRecap({
      ...input,
      report: report({ captured: { service_interest: "Website design" } }),
    });
    expect(recap.body).toContain("- What you're after: Website design");
    expect(recap.body).not.toContain("Location");
  });
});

describe("draftRecap", () => {
  it("uses the plain recap without a key", async () => {
    const fetcher = vi.fn();
    const result = await draftRecap(input, null, fetcher);
    expect(result.drafted).toBe("plain");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("falls back to the plain recap when the model is refused", async () => {
    const fetcher = vi.fn(async () => new Response("no", { status: 401 }));
    const result = await draftRecap(input, "key", fetcher);
    expect(result.drafted).toBe("plain");
  });

  it("uses the model's recap when it is readable", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            content: [
              {
                type: "text",
                text: "SUBJECT: Your call with Digital Urgency\n===BODY===\nHi Sarah,\n\nThanks for calling us about SEO citations for Oxley Plumbing.",
              },
            ],
          }),
        ),
    );
    const result = await draftRecap(input, "key", fetcher);
    expect(result).toMatchObject({
      drafted: "model",
      recap: { subject: "Your call with Digital Urgency" },
    });
  });
});

describe("withSignature", () => {
  it("signs from the team", () => {
    expect(withSignature("Body", "Digital Urgency")).toBe(
      "Body\n\nKind regards,\nThe Digital Urgency team",
    );
  });
});
