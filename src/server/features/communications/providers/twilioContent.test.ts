import { describe, expect, it } from "vitest";
import {
  createContentTemplate,
  fetchOrderConfirmationTemplate,
  withNumberedPlaceholders,
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

describe("withNumberedPlaceholders", () => {
  it("numbers what people write, and keeps the word as the sample", () => {
    const { text, variables } = withNumberedPlaceholders(
      "Hi {{name}}, your {{ service }} is ready, {{name}}.",
    );
    expect(text).toBe("Hi {{1}}, your {{2}} is ready, {{1}}.");
    expect(variables).toEqual({ "1": "name", "2": "service" });
  });

  it("gives an already-numbered slot a sample of its own", () => {
    // WhatsApp refuses a slot with no example: "BODY is missing (example)".
    expect(withNumberedPlaceholders("Hi {{1}}").variables).toEqual({
      "1": "Sample",
    });
  });

  it("leaves plain wording alone", () => {
    const { text, variables } = withNumberedPlaceholders("Hi, how are things?");
    expect(text).toBe("Hi, how are things?");
    expect(variables).toEqual({});
  });
});

describe("order confirmation approval gate", () => {
  const sid = `HX${"a".repeat(32)}`;
  const body = "Hi {{1}}, order {{2}} total {{3}}.";
  function fetcher(
    status: string,
    category = "UTILITY",
    wording = body,
  ): typeof fetch {
    return async (input) =>
      urlOf(input).endsWith("/ApprovalRequests")
        ? Response.json({ whatsapp: { status, category } })
        : Response.json({
            sid,
            language: "en",
            types: { "twilio/text": { body: wording } },
          });
  }
  it("reads pending/approved directly from Twilio without trusting a manually entered SID", async () => {
    process.env.TEST_TW_AUTH_TOKEN = "private-token";
    expect(
      await fetchOrderConfirmationTemplate(connection, sid, fetcher("pending")),
    ).toMatchObject({ status: "pending", body });
    expect(
      await fetchOrderConfirmationTemplate(
        connection,
        sid,
        fetcher("approved"),
      ),
    ).toMatchObject({ status: "approved", languageCode: "en" });
    delete process.env.TEST_TW_AUTH_TOKEN;
  });
  it("blocks reclassified templates, unknown variables and paused templates", async () => {
    process.env.TEST_TW_AUTH_TOKEN = "private-token";
    await expect(
      fetchOrderConfirmationTemplate(
        connection,
        sid,
        fetcher("approved", "MARKETING"),
      ),
    ).rejects.toThrow("utility");
    await expect(
      fetchOrderConfirmationTemplate(
        connection,
        sid,
        fetcher("approved", "UTILITY", body + " {{4}}"),
      ),
    ).rejects.toThrow();
    expect(
      await fetchOrderConfirmationTemplate(connection, sid, fetcher("paused")),
    ).toMatchObject({ status: "pending" });
    delete process.env.TEST_TW_AUTH_TOKEN;
  });
});

describe("call book-link approval", () => {
  it("accepts an approved quick-reply name/link template", async () => {
    const { fetchCallBookLinkTemplate } = await import("./twilioContent");
    process.env.TEST_TW_AUTH_TOKEN = "test-token";
    const sid = "HX" + "1".repeat(32);
    const fetcher: typeof fetch = async (input, init) => {
      expect(init?.redirect).toBe("manual");
      return Response.json(
        urlOf(input).endsWith("ApprovalRequests")
          ? { whatsapp: { status: "approved", category: "MARKETING" } }
          : {
              sid,
              language: "en",
              types: {
                "twilio/quick-reply": {
                  body: "Hi {{1}}, your requested link: {{2}}",
                },
              },
            },
      );
    };
    expect(await fetchCallBookLinkTemplate(connection, sid, fetcher)).toEqual({
      body: "Hi {{1}}, your requested link: {{2}}",
      languageCode: "en",
      status: "approved",
    });
    delete process.env.TEST_TW_AUTH_TOKEN;
  });
  it("refuses a redirected approval request without following the target", async () => {
    const { fetchCallBookLinkTemplate } = await import("./twilioContent");
    process.env.TEST_TW_AUTH_TOKEN = "test-token";
    let requests = 0;
    const fetcher: typeof fetch = async (_input, init) => {
      requests++;
      expect(init?.redirect).toBe("manual");
      return new Response(null, {
        status: 302,
        headers: { Location: "https://unapproved.example" },
      });
    };
    await expect(
      fetchCallBookLinkTemplate(connection, "HX" + "1".repeat(32), fetcher),
    ).rejects.toThrow("302");
    expect(requests).toBe(1);
    delete process.env.TEST_TW_AUTH_TOKEN;
  });
  it("rejects authentication content and templates with the wrong variables", async () => {
    const { fetchCallBookLinkTemplate } = await import("./twilioContent");
    process.env.TEST_TW_AUTH_TOKEN = "test-token";
    const sid = "HX" + "2".repeat(32);
    for (const body of ["Hi {{1}}", "Hi {{1}} {{2}} {{3}}"]) {
      const fetcher: typeof fetch = async (input) =>
        Response.json(
          urlOf(input).endsWith("ApprovalRequests")
            ? { whatsapp: { status: "approved", category: "UTILITY" } }
            : { sid, language: "en", types: { "twilio/text": { body } } },
        );
      await expect(
        fetchCallBookLinkTemplate(connection, sid, fetcher),
      ).rejects.toThrow("slots");
    }
    const fetcher: typeof fetch = async (input) =>
      Response.json(
        urlOf(input).endsWith("ApprovalRequests")
          ? { whatsapp: { status: "approved", category: "AUTHENTICATION" } }
          : {
              sid,
              language: "en",
              types: { "twilio/text": { body: "{{1}} {{2}}" } },
            },
      );
    await expect(
      fetchCallBookLinkTemplate(connection, sid, fetcher),
    ).rejects.toThrow();
    delete process.env.TEST_TW_AUTH_TOKEN;
  });
});

describe("handoff utility templates", () => {
  it("accepts only approved text utility content with the three handoff slots", async () => {
    const { fetchHandoffTemplate } = await import("./twilioContent");
    process.env.TEST_TW_AUTH_TOKEN = "test-token";
    const sid = "HX" + "3".repeat(32);
    const body =
      "BooXworm: {{1}} needs a person. Reason: {{2}}. Customer window closes {{3}}. Open DU to review.";
    const fetcher =
      (
        types: Record<string, unknown>,
        status = "approved",
        category = "UTILITY",
      ): typeof fetch =>
      async (input) =>
        Response.json(
          urlOf(input).endsWith("ApprovalRequests")
            ? { whatsapp: { status, category } }
            : { sid, language: "en", types },
        );
    expect(
      await fetchHandoffTemplate(
        connection,
        sid,
        fetcher({ "twilio/text": { body } }),
      ),
    ).toMatchObject({ body, externalTemplateId: sid });
    for (const [status, category] of [
      ["pending", "UTILITY"],
      ["paused", "UTILITY"],
      ["approved", "MARKETING"],
    ])
      await expect(
        fetchHandoffTemplate(
          connection,
          sid,
          fetcher({ "twilio/text": { body } }, status, category),
        ),
      ).rejects.toThrow("approved utility");
    await expect(
      fetchHandoffTemplate(
        connection,
        sid,
        fetcher({
          "twilio/call-to-action": {
            body,
            actions: [{ type: "PHONE_NUMBER", phone: "+61400000999" }],
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      fetchHandoffTemplate(
        connection,
        sid,
        fetcher({ "twilio/text": { body: "{{1}} {{2}}" } }),
      ),
    ).rejects.toThrow("slots");
    delete process.env.TEST_TW_AUTH_TOKEN;
  });
});
