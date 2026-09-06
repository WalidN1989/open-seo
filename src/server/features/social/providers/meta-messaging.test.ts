import { describe, expect, it } from "vitest";
import {
  fetchParticipantName,
  parseMetaMessagingPayload,
  sendSocialMessage,
} from "./meta-messaging";

const instagramDm = JSON.stringify({
  object: "instagram",
  entry: [
    {
      id: "17841400000000000",
      time: 1_757_000_000_000,
      messaging: [
        {
          sender: { id: "IGSID_CUSTOMER" },
          recipient: { id: "17841400000000000" },
          timestamp: 1_757_000_000_000,
          message: { mid: "mid.instagram.1", text: "do you have this book?" },
        },
      ],
    },
  ],
});

describe("parseMetaMessagingPayload", () => {
  it("reads an Instagram direct message", () => {
    const [delivery] = parseMetaMessagingPayload(instagramDm);
    expect(delivery).toMatchObject({
      platform: "instagram",
      accountExternalId: "17841400000000000",
    });
    expect(delivery?.messages[0]).toMatchObject({
      externalMessageId: "mid.instagram.1",
      participantId: "IGSID_CUSTOMER",
      text: "do you have this book?",
      isEcho: false,
    });
    expect(delivery?.messages[0]?.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("reads a Messenger message and its attachment", () => {
    const [delivery] = parseMetaMessagingPayload(
      JSON.stringify({
        object: "page",
        entry: [
          {
            id: "PAGE_1",
            messaging: [
              {
                sender: { id: "PSID_1" },
                recipient: { id: "PAGE_1" },
                timestamp: 1_757_000_000_000,
                message: {
                  mid: "mid.page.1",
                  attachments: [
                    { type: "image", payload: { url: "https://cdn/a.jpg" } },
                  ],
                },
              },
            ],
          },
        ],
      }),
    );
    expect(delivery?.platform).toBe("messenger");
    expect(delivery?.messages[0]).toMatchObject({
      text: null,
      attachmentUrl: "https://cdn/a.jpg",
    });
  });

  it("marks the page's own message as an echo, so a reply cannot loop", () => {
    const [delivery] = parseMetaMessagingPayload(
      JSON.stringify({
        object: "page",
        entry: [
          {
            id: "PAGE_1",
            messaging: [
              {
                sender: { id: "PAGE_1" },
                recipient: { id: "PSID_1" },
                timestamp: 1,
                message: { mid: "mid.echo", text: "our reply", is_echo: true },
              },
            ],
          },
        ],
      }),
    );
    expect(delivery?.messages[0]?.isEcho).toBe(true);
  });

  it("ignores everything that is not a message", () => {
    // Read receipts, reactions and delivery notices share the same webhook.
    expect(
      parseMetaMessagingPayload(
        JSON.stringify({
          object: "page",
          entry: [
            {
              id: "PAGE_1",
              messaging: [
                { sender: { id: "PSID_1" }, read: { watermark: 1 } },
                { sender: { id: "PSID_1" }, reaction: { emoji: "❤️" } },
              ],
            },
          ],
        }),
      ),
    ).toEqual([]);
    expect(parseMetaMessagingPayload("not json")).toEqual([]);
    expect(
      parseMetaMessagingPayload(
        JSON.stringify({ object: "whatsapp_business_account", entry: [] }),
      ),
    ).toEqual([]);
  });
});

describe("sendSocialMessage", () => {
  it("posts through the Page with the token, and surfaces Meta's reason", async () => {
    let seen: { url: string; auth: string | null; body: string } = {
      url: "",
      auth: null,
      body: "",
    };
    const ok = (async (url: RequestInfo | URL, init?: RequestInit) => {
      seen = {
        url: url instanceof Request ? url.url : url.toString(),
        auth: new Headers(init?.headers).get("authorization"),
        body: typeof init?.body === "string" ? init.body : "",
      };
      return Response.json({ message_id: "mid.sent.1" });
    }) as typeof fetch;
    const sent = await sendSocialMessage({
      pageId: "PAGE_1",
      token: "page-token",
      recipientId: "PSID_1",
      text: "Yes, it's in stock.",
      fetcher: ok,
    });
    expect(sent.externalMessageId).toBe("mid.sent.1");
    expect(seen.url).toBe("https://graph.facebook.com/v21.0/PAGE_1/messages");
    expect(seen.auth).toBe("Bearer page-token");
    expect(seen.body).toContain('"messaging_type":"RESPONSE"');

    const failing = (async () =>
      Response.json(
        {
          error: { message: "This message is sent outside of allowed window" },
        },
        { status: 400 },
      )) as typeof fetch;
    await expect(
      sendSocialMessage({
        pageId: "PAGE_1",
        token: "page-token",
        recipientId: "PSID_1",
        text: "late",
        fetcher: failing,
      }),
    ).rejects.toThrow(/outside of allowed window/);
  });
});

describe("fetchParticipantName", () => {
  it("asks for username on Instagram and name on Messenger", async () => {
    const urls: string[] = [];
    const fetcher = (async (url: RequestInfo | URL) => {
      urls.push(url instanceof Request ? url.url : url.toString());
      return Response.json({ username: "reader_99", name: "Jane Doe" });
    }) as typeof fetch;
    await expect(
      fetchParticipantName({
        participantId: "IGSID",
        token: "t",
        platform: "instagram",
        fetcher,
      }),
    ).resolves.toBe("reader_99");
    await expect(
      fetchParticipantName({
        participantId: "PSID",
        token: "t",
        platform: "messenger",
        fetcher,
      }),
    ).resolves.toBe("Jane Doe");
    expect(urls[0]).toContain("fields=username");
    expect(urls[1]).toContain("fields=name");
  });

  it("falls back to the display name when an Instagram profile has no handle", async () => {
    const fetcher = (async () =>
      Response.json({ name: "Jane Doe" })) as typeof fetch;
    await expect(
      fetchParticipantName({
        participantId: "IGSID",
        token: "t",
        platform: "instagram",
        fetcher,
      }),
    ).resolves.toBe("Jane Doe");
  });

  it("returns nothing rather than failing when Meta refuses the profile", async () => {
    const fetcher = (async () =>
      new Response("no", { status: 403 })) as typeof fetch;
    await expect(
      fetchParticipantName({
        participantId: "X",
        token: "t",
        platform: "instagram",
        fetcher,
      }),
    ).resolves.toBeNull();
  });
});
