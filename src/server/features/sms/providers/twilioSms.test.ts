import { describe, expect, it, vi } from "vitest";
import { readTwilioSms, sendTwilioSms } from "./twilioSms";

describe("readTwilioSms", () => {
  it("reads an inbound text", () => {
    expect(
      readTwilioSms({
        MessageSid: "SM1",
        SmsStatus: "received",
        From: "+61412345678",
        To: "+19412974258",
        Body: "Is the quote still valid?",
        NumMedia: "0",
      }),
    ).toEqual({
      kind: "inbound",
      sid: "SM1",
      from: "+61412345678",
      to: "+19412974258",
      body: "Is the quote still valid?",
      media: 0,
    });
  });

  it("reads a delivery update, including a failure reason", () => {
    expect(
      readTwilioSms({ MessageSid: "SM2", MessageStatus: "delivered" }),
    ).toEqual({ kind: "status", sid: "SM2", status: "delivered", error: null });
    expect(
      readTwilioSms({
        MessageSid: "SM3",
        MessageStatus: "undelivered",
        ErrorCode: "30007",
      }),
    ).toEqual({
      kind: "status",
      sid: "SM3",
      status: "failed",
      error: "Twilio error 30007",
    });
    expect(readTwilioSms({})).toBeNull();
  });
});

describe("sendTwilioSms", () => {
  it("posts the text with basic auth and the status callback", async () => {
    const calls: { url: string; body: string; auth: string | null }[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({
        url: typeof input === "string" ? input : "",
        body: typeof init?.body === "string" ? init.body : "",
        auth: new Headers(init?.headers).get("authorization"),
      });
      return Response.json({ sid: "SM9", status: "queued" }, { status: 201 });
    };
    const result = await sendTwilioSms(
      {
        accountSid: "AC1",
        authToken: "t",
        from: "+19412974258",
        to: "+61412345678",
        body: "Hi",
        statusCallback: "https://app.test/api/sms/twilio/c1",
      },
      fetcher,
    );
    expect(result).toEqual({ sid: "SM9", status: "queued" });
    expect(calls[0]?.url).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json",
    );
    expect(calls[0]?.body).toContain("StatusCallback=https%3A%2F%2Fapp.test");
    expect(calls[0]?.auth).toBe(`Basic ${btoa("AC1:t")}`);
  });

  it("says why Twilio refused", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { code: 21610, message: "Unsubscribed recipient" },
        { status: 400 },
      ),
    );
    await expect(
      sendTwilioSms(
        {
          accountSid: "AC1",
          authToken: "t",
          from: "+1",
          to: "+61",
          body: "Hi",
          statusCallback: null,
        },
        fetcher,
      ),
    ).rejects.toThrow(
      "Twilio refused the text (21610): Unsubscribed recipient",
    );
  });
});
