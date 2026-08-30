import { describe, expect, it } from "vitest";
import {
  parseMetaPayload,
  parseTwilioPayload,
  sendWhatsappText,
  sendWhatsappTemplate,
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
    expect(result.messages[0]?.body).toBe("Hi");
    expect(result.statuses).toEqual([
      { externalMessageId: "wamid.2", status: "delivered" },
    ]);
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
