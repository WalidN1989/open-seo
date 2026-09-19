/**
 * What the in-app voice says the moment it is opened.
 *
 * The account's name is only used when it reads as a person's first name. An
 * account named after the business ("DigitalUrgency") is common — it is how
 * the agency's own login is set up — and "Hi DigitalUrgency" is worse than no
 * name at all.
 */

function compact(text: string) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export function greetingName(
  accountName: string | null | undefined,
  organizationNames: string[],
) {
  const first = accountName?.trim().split(/\s+/)[0] ?? "";
  if (!/^\p{L}[\p{L}'-]*$/u.test(first)) return "";
  const key = compact(first);
  if (key.length < 2) return "";
  const isBusiness = organizationNames.some((name) => {
    const org = compact(name);
    return org.length >= 4 && (org.includes(key) || key.includes(org));
  });
  return isBusiness ? "" : first;
}

export function greetingText(name: string) {
  return name
    ? `Hi ${name}, how can I help you today?`
    : "Hi, how can I help you today?";
}
