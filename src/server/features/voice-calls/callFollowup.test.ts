import { describe, expect, it } from "vitest";
import { callFollowupRouting, callFollowupSms } from "./callFollowup";

describe("callFollowupRouting", () => {
  it("uses the caller ID when WhatsApp is confirmed on the same number", () => {
    expect(
      callFollowupRouting({
        captured: {
          whatsapp_preference: "same number",
          sms_consent: "yes",
        },
        callerNumber: "+61412345678",
        region: "AU",
      }),
    ).toEqual({
      whatsappRecipient: "+61412345678",
      smsRecipient: "+61412345678",
      smsAllowed: true,
      noWhatsapp: false,
    });
  });

  it("uses a different WhatsApp number when the caller supplies one", () => {
    expect(
      callFollowupRouting({
        captured: {
          whatsapp_preference: "different number",
          whatsapp_number: "0411 222 333",
          callback_details: "0400 999 888",
          sms_consent: "no",
        },
        callerNumber: "+61730000000",
        region: "AU",
      }),
    ).toMatchObject({
      whatsappRecipient: "+61411222333",
      smsRecipient: "+61400999888",
      smsAllowed: false,
      noWhatsapp: false,
    });
  });

  it("suppresses WhatsApp and keeps the mobile for an approved SMS fallback", () => {
    expect(
      callFollowupRouting({
        captured: {
          whatsapp_preference: "no whatsapp",
          callback_details: "0422 333 444",
          sms_consent: "confirmed",
        },
        callerNumber: "+61730000000",
        region: "AU",
      }),
    ).toEqual({
      whatsappRecipient: null,
      smsRecipient: "+61422333444",
      smsAllowed: true,
      noWhatsapp: true,
    });
  });
});

describe("callFollowupSms", () => {
  it("writes a short transactional follow-up without promising a deadline", () => {
    expect(
      callFollowupSms({
        firstName: "Alex",
        serviceInterest: "Colourbond fence replacement, rear boundary",
      }),
    ).toBe(
      "Hi Alex, thanks for calling Southside Fencing. We've received your Colourbond fence replacement enquiry and the team will follow up. Reply here if you'd like to add anything.",
    );
  });
});
