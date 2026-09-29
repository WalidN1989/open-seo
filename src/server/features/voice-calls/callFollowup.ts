import {
  phoneFromText,
  shortNeed,
  type PhoneRegion,
} from "./elevenlabsWebhook";

function normalisedAnswer(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function saysNo(value: string) {
  return /^(?:no|none|false|not available|no whatsapp|does not have whatsapp|doesn't have whatsapp)$/i.test(
    value,
  );
}

function saysYes(value: string) {
  return /^(?:yes|true|ok|okay|confirmed|consent(?:ed)?|same number)$/i.test(
    value,
  );
}

/**
 * Turn the agent's post-call fields into explicit channel destinations.
 * Older agents only captured `callback_details`, so that remains the safe
 * legacy fallback until every live agent publishes the newer fields.
 */
export function callFollowupRouting(input: {
  captured: Record<string, string>;
  callerNumber: string | null;
  region: PhoneRegion;
}) {
  const preference = normalisedAnswer(input.captured.whatsapp_preference);
  const callback = phoneFromText(input.captured.callback_details, input.region);
  const statedWhatsapp = phoneFromText(
    input.captured.whatsapp_number,
    input.region,
  );
  const statedSms = phoneFromText(input.captured.sms_number, input.region);
  const noWhatsapp = saysNo(preference);

  return {
    whatsappRecipient: noWhatsapp
      ? null
      : (statedWhatsapp ?? callback ?? input.callerNumber),
    smsRecipient: statedSms ?? callback ?? input.callerNumber,
    smsAllowed: saysYes(normalisedAnswer(input.captured.sms_consent)),
    noWhatsapp,
  };
}

export function callFollowupSms(input: {
  firstName: string;
  serviceInterest?: string;
}) {
  const name = input.firstName.trim() || "there";
  const need = shortNeed(input.serviceInterest);
  const subject = need === "Phone enquiry" ? "enquiry" : `${need} enquiry`;
  return `Hi ${name}, thanks for calling Southside Fencing. We've received your ${subject} and the team will follow up. Reply here if you'd like to add anything.`;
}
