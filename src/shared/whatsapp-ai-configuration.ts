import {
  whatsappResponseMessagesSchema,
  type WhatsappResponseMessages,
} from "@/types/schemas/whatsappResponseMessages";

/** Visible configuration defaults; runtime wording is always taken from settings. */
export const DEFAULT_WHATSAPP_STYLE = [
  "Keep replies short: normally one or two sentences. Combine recent customer messages into one answer. Do not repeat a question, greeting or pre-order offer already made or declined.",
  "Reply in the language and script of the customer's latest message, including Sinhala, Tamil, Singlish and Tanglish. Keep titles and links as written. Ask at most one question at a time.",
  "Use WhatsApp formatting: single asterisks for emphasis, no headings or bracketed links; put a bare URL instead.",
  "When a customer greets a staff member by name, greet them warmly on behalf of the team, without correcting their greeting or claiming to be that person. Do not volunteer an automated introduction or mention internal systems.",
  "For a matched product, give the title, confirmed price, recorded availability and product link. Offer a pre-order at most once, when relevant and not already declined.",
  "For ambiguous orders, ask which date or item they mean. If no order matches, ask whether a different ordering number was used and hand off for verification. Ask a clarifying question when an image is unclear.",
].join("\n\n");
export const DEFAULT_ASSISTANT_PERSONA =
  "You are a customer-service representative for this business.";
export const DEFAULT_HANDOFF_MESSAGE =
  "Thanks for your message. Our team will review it and get back to you.";
export const DEFAULT_WHATSAPP_RESPONSES: WhatsappResponseMessages = {
  verificationLocked:
    "There have been too many verification attempts. Please try again shortly or contact our team for help.",
  verificationRejected:
    "That code does not match an account. Send /verify followed by your eight-character code in two groups of four. {{remaining}} attempts remaining.",
  verificationSuccess:
    "Thanks — you are verified as {{displayName}}. What would you like to know?",
  imageUnavailable:
    "We received your image but couldn't view it. Could you describe what you'd like us to check?",
  teamAlert:
    "Customer {{customer}} needs help. Reason: {{reason}}. Customer reply window closes at {{expiresAt}}. Please review the pending chat.",
};
export const WHATSAPP_RESPONSE_FIELDS = [
  {
    key: "verificationLocked",
    label: "Verification locked",
    variables: "None",
  },
  {
    key: "verificationRejected",
    label: "Verification rejected",
    variables: "{{remaining}}",
  },
  {
    key: "verificationSuccess",
    label: "Verification succeeded",
    variables: "{{displayName}}",
  },
  { key: "imageUnavailable", label: "Image unavailable", variables: "None" },
  {
    key: "teamAlert",
    label: "Staff handoff alert",
    variables: "{{customer}}, {{reason}}, {{expiresAt}}",
  },
] as const;

export function parseWhatsappResponses(
  raw: string | null | undefined,
): WhatsappResponseMessages {
  if (!raw) return { ...DEFAULT_WHATSAPP_RESPONSES };
  const value: unknown = JSON.parse(raw);
  return whatsappResponseMessagesSchema.parse(value);
}
export function renderWhatsappResponse(
  template: string,
  values: Record<string, string | number> = {},
) {
  return template.replace(/\{\{([^{}]+)\}\}/g, (_, key: string) =>
    String(values[key] ?? ""),
  );
}

type StoredWriting = {
  persona?: string | null;
  handoffMessage?: string | null;
  replyStyle?: string | null;
  responseMessagesJson?: string | null;
};
export function whatsappWritingSnapshot(row: StoredWriting | null) {
  return {
    instructions: row?.persona ?? null,
    handoffMessage: row?.handoffMessage ?? null,
    replyStyle: row?.replyStyle ?? null,
    responseMessages: row?.responseMessagesJson
      ? parseWhatsappResponses(row.responseMessagesJson)
      : null,
  };
}
