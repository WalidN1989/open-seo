import { loadWhatsappImage } from "./whatsapp-media";
import { describe, expect, it } from "vitest";
import {
  parseMetaPayload,
  parseTwilioPayload,
  sendWhatsappText,
  sendWhatsappTemplate,
  whatsappWebhookResponse,
} from "./whatsapp";
import { verifyMetaSignature, verifyTwilioSignature } from "./signatures";

describe("WhatsApp provider boundaries", () => {
  it("parses an inbound Twilio message", () => {
    const result = parseTwilioPayload({
      MessageSid: "SM123",
      From: "whatsapp:+61400000000",
      To: "whatsapp:+61180000000",
      Body: "Hello",
    });
    expect(result.messages[0]).toMatchObject({
      externalMessageId: "SM123",
      sender: "+61400000000",
      recipient: "+61180000000",
      body: "Hello",
      messageType: "text",
    });
  });

  it("keeps a Twilio image reference and caption", () => {
    const message = parseTwilioPayload({
      MessageSid: "SM123",
      From: "whatsapp:+61400000000",
      Body: "Do you stock this?",
      MediaContentType0: "image/jpeg",
      MediaUrl0:
        "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages/SM123/Media/ME123",
    }).messages[0];
    expect(message).toMatchObject({
      body: "Do you stock this?",
      messageType: "image",
      mediaContentType: "image/jpeg",
    });
    expect(message.mediaUrl).toContain("/Media/ME123");
  });

  it("does not mistake an image without a caption for a status callback", () => {
    const parsed = parseTwilioPayload({
      MessageSid: "SM123",
      MessageStatus: "received",
      From: "whatsapp:+61400000000",
      MediaContentType0: "image/jpeg",
      MediaUrl0:
        "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages/SM123/Media/ME123",
    });
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.statuses).toHaveLength(0);
  });

  it("parses Meta messages and delivery updates", () => {
    const result = parseMetaPayload({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "wamid.1",
                    from: "61400000000",
                    type: "text",
                    text: { body: "Hi" },
                  },
                ],
                statuses: [{ id: "wamid.2", status: "delivered" }],
              },
            },
          ],
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].messages[0]?.body).toBe("Hi");
    expect(result[0].statuses).toEqual([
      { externalMessageId: "wamid.2", status: "delivered" },
    ]);
  });

  it("keeps a Meta image id and caption", () => {
    const message = parseMetaPayload({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "wamid.image",
                    from: "94700000000",
                    type: "image",
                    image: {
                      id: "123456789",
                      mime_type: "image/png",
                      caption: "This book?",
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    })[0].messages[0];
    expect(message).toMatchObject({
      body: "This book?",
      messageType: "image",
      mediaId: "123456789",
      mediaContentType: "image/png",
    });
  });

  it("fetches a Meta image only from its trusted media host", async () => {
    process.env.TEST_META_ACCESS_TOKEN = "private-token";
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer private-token",
      });
      const url =
        input instanceof URL
          ? input.toString()
          : typeof input === "string"
            ? input
            : input.url;
      if (url.includes("graph.facebook.com")) {
        return Response.json({
          url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/123",
        });
      }
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/png" },
      });
    };
    const image = await loadWhatsappImage(
      {
        id: "connection",
        provider: "meta_cloud",
        displayPhoneNumber: null,
        externalAccountId: "phone",
        credentialReference: "TEST_META",
      },
      { mediaId: "123456789" },
      fetcher,
    );
    expect(image).toEqual({ mediaType: "image/png", data: "AQID" });
    delete process.env.TEST_META_ACCESS_TOKEN;
  });

  it("refuses an image redirect to an untrusted host", async () => {
    process.env.TEST_META_ACCESS_TOKEN = "private-token";
    await expect(
      loadWhatsappImage(
        {
          id: "connection",
          provider: "meta_cloud",
          displayPhoneNumber: null,
          externalAccountId: "phone",
          credentialReference: "TEST_META",
        },
        { mediaId: "123456789" },
        async () => Response.json({ url: "https://example.org/private" }),
      ),
    ).rejects.toThrow("Untrusted WhatsApp media URL");
    delete process.env.TEST_META_ACCESS_TOKEN;
  });

  it("verifies Meta HMAC signatures", async () => {
    const body = '{"object":"whatsapp_business_account"}';
    expect(
      await verifyMetaSignature(
        body,
        "sha256=03f6dd944ecab4ddac0e3dbc3923b2da4e12b03df679ae23a52efd78ca6056e0",
        "secret",
      ),
    ).toBe(true);
    expect(await verifyMetaSignature(body, "sha256=wrong", "secret")).toBe(
      false,
    );
  });

  it("verifies Twilio's sorted parameter signature", async () => {
    expect(
      await verifyTwilioSignature(
        "https://example.com/api/whatsapp/connection",
        { Body: "Hello", From: "whatsapp:+1" },
        "LxsapFKsjg9pAUFuvTZ6BOk1ryE=",
        "secret",
      ),
    ).toBe(true);
  });

  it("sends Meta messages without persisting credentials", async () => {
    process.env.TEST_META_ACCESS_TOKEN = "private-token";
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer private-token",
      });
      return Response.json({ messages: [{ id: "wamid.outbound" }] });
    };
    const result = await sendWhatsappText(
      {
        id: "connection",
        provider: "meta_cloud",
        displayPhoneNumber: null,
        externalAccountId: "phone-number-id",
        credentialReference: "TEST_META",
      },
      "61400000000",
      "Hello",
      fetcher,
    );
    expect(result).toEqual({
      externalMessageId: "wamid.outbound",
      status: "sent",
    });
    delete process.env.TEST_META_ACCESS_TOKEN;
  });

  it("sends an image with the text on Twilio", async () => {
    process.env.TEST_TWILIO_AUTH_TOKEN = "private-token";
    const captured: { body?: URLSearchParams } = {};
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.body instanceof URLSearchParams) captured.body = init.body;
      return Response.json({ sid: "SM1", status: "queued" });
    };
    await sendWhatsappText(
      {
        id: "connection",
        provider: "twilio",
        displayPhoneNumber: "+14155238886",
        externalAccountId: "AC123",
        credentialReference: "TEST_TWILIO",
      },
      "+971504863547",
      "Weekend sale",
      fetcher,
      "https://www.bestrends.lk/slides.jpg",
    );
    expect(captured.body?.get("Body")).toBe("Weekend sale");
    expect(captured.body?.get("MediaUrl")).toBe(
      "https://www.bestrends.lk/slides.jpg",
    );
    delete process.env.TEST_TWILIO_AUTH_TOKEN;
  });

  it("sends provider-approved Meta templates for campaigns", async () => {
    process.env.TEST_META_ACCESS_TOKEN = "private-token";
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(typeof init?.body).toBe("string");
      const body = typeof init?.body === "string" ? init.body : "";
      expect(body).toContain('"type":"template"');
      expect(body).toContain('"name":"welcome"');
      return Response.json({ messages: [{ id: "wamid.campaign" }] });
    };
    await expect(
      sendWhatsappTemplate(
        {
          id: "connection",
          provider: "meta_cloud",
          displayPhoneNumber: null,
          externalAccountId: "phone-number-id",
          credentialReference: "TEST_META",
        },
        "61400000000",
        {
          name: "welcome",
          languageCode: "en",
          externalTemplateId: null,
        },
        fetcher,
      ),
    ).resolves.toEqual({
      externalMessageId: "wamid.campaign",
      status: "sent",
    });
    delete process.env.TEST_META_ACCESS_TOKEN;
  });
});

describe("whatsappWebhookResponse", () => {
  it("answers a handled webhook with empty TwiML so Twilio sends nothing back", async () => {
    const response = whatsappWebhookResponse({ status: 200, body: "ok" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/xml");
    await expect(response.text()).resolves.toContain("<Response/>");
  });

  it("keeps a failure's reason as plain text", async () => {
    const response = whatsappWebhookResponse({
      status: 401,
      body: "Invalid signature",
    });
    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Invalid signature");
  });
});
