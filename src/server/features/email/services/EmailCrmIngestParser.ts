import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email();
export const FORM_SUBJECT = /^new quote request\s*[—-]/i;
const EXCLUDED_ADDRESSES = [
  /@digitalurgency\.com\.au$/i,
  /@xero\.com$/i,
  /@godaddy\.com$/i,
  /@microsoft\.com$/i,
  /@post\.xero\.com$/i,
  /@seminolefeedcom\.com$/i,
  /@tdtradingcenter\.com$/i,
  /@o2\.pl$/i,
  /@dainereid\.com$/i,
  /@marketingstrategypartner\.com$/i,
  /@booxworm\.lk$/i,
  /^walidnazmi\.1989@gmail\.com$/i,
];
const EXCLUDED_SUBJECTS = [
  /invoice/i,
  /security (alert|info|code)/i,
  /seo (report|proposal|services?)/i,
  /review (management|marketing)/i,
  /delivery (failure|notification)/i,
  /undeliver/i,
  /test (email|submission|quote)/i,
  /automatic reply/i,
];

export type IngestMessage = {
  direction: string;
  fromAddress: string;
  toAddresses: string;
  subject: string | null;
  textBody: string | null;
};

export type CustomerIdentity = {
  email: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  suburb?: string;
  service?: string;
  requirements?: string;
};

function clean(value: string) {
  return value
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\r/g, "")
    .trim();
}

function address(value: string) {
  const bracketed = value.match(/<([^>]+)>/);
  const candidate = (bracketed?.[1] ?? value).trim().toLowerCase();
  return emailSchema.safeParse(candidate).success ? candidate : null;
}

function displayName(value: string) {
  const before = value.includes("<") ? value.slice(0, value.indexOf("<")) : "";
  return before.replace(/^['"]|['"]$/g, "").trim();
}

function splitName(name: string, email: string) {
  const usable = clean(name)
    .replace(/\b(via|on behalf of)\b.*$/i, "")
    .trim();
  const fallback = email
    .split("@")[0]
    .replace(/[._+-]+/g, " ")
    .replace(/\d+/g, " ")
    .trim();
  const words = (usable || fallback || "Email customer")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1));
  return {
    firstName: words[0] || "Email customer",
    lastName: words.length > 1 ? words.slice(1).join(" ") : undefined,
  };
}

function field(body: string, label: string) {
  const match = clean(body).match(
    new RegExp(
      `(?:^|\\n)\\s*${label}\\s*:\\s*(?:([^\\n]+)|\\n\\s*([^\\n]+))`,
      "i",
    ),
  );
  return (match?.[1] ?? match?.[2])?.trim();
}

export function parseWebsiteInquiry(body: string): CustomerIdentity | null {
  const email = field(body, "Email");
  const name = field(body, "Name") ?? "Email customer";
  const parsedEmail = emailSchema.safeParse(email);
  if (!parsedEmail.success) return null;
  return {
    email: parsedEmail.data,
    ...splitName(name, parsedEmail.data),
    phone: field(body, "Phone"),
    suburb: field(body, "Suburb\\s*/\\s*Area"),
    service: field(body, "Service"),
    requirements: field(body, "Project details"),
  };
}

function parseAddressList(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function externalParty(messages: IngestMessage[], mailbox: string) {
  for (const message of messages) {
    const candidates =
      message.direction === "inbound"
        ? [message.fromAddress]
        : parseAddressList(message.toAddresses);
    for (const candidate of candidates) {
      const email = address(candidate);
      if (email && email !== mailbox) return { email, message };
    }
  }
  return null;
}

function greetingName(message: IngestMessage) {
  return (
    message.textBody
      ?.match(/(?:^|\n)\s*(?:hi|hello|dear)\s+([^,\n]{2,60})[,\n]/i)?.[1]
      ?.trim() ?? ""
  );
}

function signatureName(message: IngestMessage) {
  const ownText = (message.textBody ?? "")
    .split(/\n(?:From:|On .+wrote:)/i)[0]
    .slice(0, 4_000);
  const candidate =
    ownText
      .match(
        /(?:kind regards|thanks and regards|thanks a lot|regards)[,:]?\s*\n+(?:\s*\n)*([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)?)/i,
      )?.[1]
      ?.trim() ?? "";
  return /^(?:fencing|ph|phone|mobile|email|southside|kind)(?:\s|$)/i.test(
    candidate,
  )
    ? ""
    : candidate;
}

function signatureNameFor(messages: IngestMessage[]) {
  for (const message of messages) {
    if (message.direction !== "inbound") continue;
    const name = signatureName(message);
    if (name) return name;
  }
  return "";
}

function phoneFor(messages: IngestMessage[]) {
  const body = messages
    .filter((message) => message.direction === "inbound")
    .map((message) => message.textBody ?? "")
    .join("\n");
  return body
    .match(/(?:\+?61\s?|0)(?:[23478]|4)(?:[\s-]?\d){8}/)?.[0]
    ?.replace(/\s+/g, " ")
    .trim();
}

export function identifyCustomer(
  subject: string,
  messages: IngestMessage[],
  mailboxAddress: string,
): CustomerIdentity | null {
  const form = messages.find(
    (message) =>
      message.direction === "inbound" &&
      FORM_SUBJECT.test(message.subject ?? subject),
  );
  if (form?.textBody) {
    const identity = parseWebsiteInquiry(form.textBody);
    if (
      !identity ||
      EXCLUDED_ADDRESSES.some((pattern) => pattern.test(identity.email))
    )
      return null;
    return identity;
  }
  const party = externalParty(messages, mailboxAddress.trim().toLowerCase());
  if (!party) return null;
  const combinedBody = messages
    .map((message) => message.textBody ?? "")
    .join("\n");
  if (
    EXCLUDED_ADDRESSES.some((pattern) => pattern.test(party.email)) ||
    EXCLUDED_SUBJECTS.some((pattern) => pattern.test(subject)) ||
    /booxworm|ozbuildmaterials|tradetools|marketing pitch/i.test(combinedBody)
  )
    return null;
  const hasCustomerIntent =
    /quote|quotation|fenc|gate|retaining|paling|post cap|site visit|rfq|shared/i.test(
      `${subject}\n${combinedBody.slice(0, 2_000)}`,
    );
  if (
    !messages.some((message) => message.direction === "outbound") &&
    !hasCustomerIntent
  )
    return null;
  const inboundName =
    party.message.direction === "inbound"
      ? displayName(party.message.fromAddress) ||
        signatureName(party.message) ||
        signatureNameFor(messages)
      : greetingName(party.message) || signatureNameFor(messages);
  return {
    email: party.email,
    ...splitName(inboundName, party.email),
    phone: phoneFor(messages),
  };
}

export function categoryFor(text: string) {
  if (/retain(?:ing)? wall|concrete sleeper/i.test(text))
    return "Retaining Wall";
  if (/colorbond|colourbond/i.test(text)) return "Colorbond Fencing";
  if (/timber|paling/i.test(text)) return "Timber Fencing";
  if (/gate|pedestrian access/i.test(text)) return "Gates";
  if (/repair|replace|post cap/i.test(text)) return "Fence Repair";
  return "Fencing";
}

export function leadTitle(identity: CustomerIdentity, subject: string) {
  const name = [identity.firstName, identity.lastName]
    .filter(Boolean)
    .join(" ");
  const request =
    identity.service || subject.replace(/^(?:re|fw|fwd):\s*/i, "");
  return `${name} — ${request}`.slice(0, 200);
}

export function notesFor(
  identity: CustomerIdentity,
  messages: IngestMessage[],
) {
  const parts = [
    identity.suburb ? `Area: ${identity.suburb}` : null,
    identity.phone ? `Phone: ${identity.phone}` : null,
    identity.service ? `Service: ${identity.service}` : null,
    identity.requirements ? `Requirements: ${identity.requirements}` : null,
  ].filter(Boolean);
  const firstInbound = messages.find(
    (message) => message.direction === "inbound",
  );
  if (!identity.requirements && firstInbound?.textBody)
    parts.push(
      `Initial inquiry:\n${clean(firstInbound.textBody).slice(0, 7_500)}`,
    );
  return parts.join("\n\n").slice(0, 10_000);
}
