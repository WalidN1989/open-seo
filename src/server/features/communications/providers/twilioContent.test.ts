import { describe, expect, it } from "vitest";
import {
  createContentTemplate,
  fetchApproval,
  submitForApproval,
  templateName,
} from "./twilioContent";

const connection = {
  id: "c1",
  provider: "twilio" as const,
  displayPhoneNumber: "+61408579044",
  externalAccountId: "AC123",
  credentialReference: "TEST_TW",
};

function urlOf(input: RequestInfo | URL) {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

describe("templateName", () => {
  it("is the name WhatsApp accepts", () => {
    expect(templateName("Intro — Digital Urgency!")).toBe(
      "intro_digital_urgency",
    );
  });
});

describe("createContentTemplate", () => {
  it("sends an image template when there is an image", async () => {
    process.env.TEST_TW_AUTH_TOKEN = "private-token";
    let body: unknown = null;
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      return Response.json({ sid: "HX1" });
    };
    const sid = await createContentTemplate(
      connection,
      {
        name: "Intro",
        languageCode: "en",
        body: "Hi, we are Digital Urgency.",
        mediaUrl: "https://example.com/hero.jpg",
        category: "MARKETING",
      },
      fetcher,
    );
    expect(sid).toBe("HX1");
    expect(body).toMatchObject({
      friendly_name: "intro",
      language: "en",
      types: {
        "twilio/media": {
          body: "Hi, we are Digital Urgency.",
          media: ["https://example.com/hero.jpg"],
        },
      },
    });
    delete process.env.TEST_TW_AUTH_TOKEN;
  });

  it("sends a plain text template when there is none", async () => {
    process.env.TEST_TW_AUTH_TOKEN = "private-token";
    let body: unknown = null;
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      return Response.json({ sid: "HX2" });
    };
    await createContentTemplate(
      connection,
      {
        name: "Intro",
        languageCode: "en",
        body: "Hello.",
        category: "UTILITY",
      },
      fetcher,
    );
    expect(body).toMatchObject({
      types: { "twilio/text": { body: "Hello." } },
    });
    delete process.env.TEST_TW_AUTH_TOKEN;
  });
});

describe("submitForApproval", () => {
  it("asks WhatsApp and reads back where it stands", async () => {
    process.env.TEST_TW_AUTH_TOKEN = "private-token";
    const seen: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      seen.push(urlOf(input));
      return Response.json({ status: "received", rejection_reason: "" });
    };
    const approval = await submitForApproval(
      connection,
      "HX1",
      { name: "Intro", category: "MARKETING" },
      fetcher,
    );
    expect(seen[0]).toContain("/Content/HX1/ApprovalRequests/whatsapp");
    expect(approval).toEqual({ status: "pending", reason: null });
    delete process.env.TEST_TW_AUTH_TOKEN;
  });
});

describe("fetchApproval", () => {
  it("reports approval, and a rejection with its reason", async () => {
    process.env.TEST_TW_AUTH_TOKEN = "private-token";
    const approved = await fetchApproval(connection, "HX1", async () =>
      Response.json({ whatsapp: { status: "approved" } }),
    );
    expect(approved.status).toBe("approved");
    const rejected = await fetchApproval(connection, "HX1", async () =>
      Response.json({
        whatsapp: { status: "rejected", rejection_reason: "Promotional" },
      }),
    );
    expect(rejected).toEqual({ status: "rejected", reason: "Promotional" });
    delete process.env.TEST_TW_AUTH_TOKEN;
  });

  it("says what Twilio refused, rather than failing silently", async () => {
    process.env.TEST_TW_AUTH_TOKEN = "private-token";
    await expect(
      fetchApproval(connection, "HX1", async () =>
        Response.json({ message: "Template not found" }, { status: 404 }),
      ),
    ).rejects.toThrow("Template not found");
    delete process.env.TEST_TW_AUTH_TOKEN;
  });
});
