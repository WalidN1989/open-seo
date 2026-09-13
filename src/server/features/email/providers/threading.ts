/**
 * Email has no thread id; a reply names the message it answers. These helpers
 * turn RFC 5322 headers into the lookups the mirror needs.
 */

/** Message-ids a reply refers to, most specific first, without duplicates. */
export function referencedMessageIds(input: {
  inReplyTo: string | null;
  references: string[];
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [input.inReplyTo, ...input.references.toReversed()]) {
    const id = normalizeMessageId(raw);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** "<abc@x>" and "abc@x" are the same id; whitespace is noise. */
export function normalizeMessageId(raw: string | null | undefined) {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^<|>$/g, "").trim();
  return trimmed || null;
}

export function replySubject(subject: string | null | undefined) {
  const base = (subject ?? "").trim();
  if (!base) return "Re:";
  return /^re:/i.test(base) ? base : `Re: ${base}`;
}

/**
 * A Cc or Bcc list as it will be sent: trimmed, lower-cased, without
 * repeats, without anyone already in `exclude` (the sender, the To).
 */
export function cleanRecipients(
  list: readonly string[] | undefined,
  exclude: readonly string[],
): string[] {
  const taken = new Set(exclude.map(bareAddress));
  const out: string[] = [];
  for (const raw of list ?? []) {
    const address = bareAddress(raw);
    if (!address || taken.has(address)) continue;
    taken.add(address);
    out.push(address);
  }
  return out;
}

/** "Jane <jane@x.com>" → "jane@x.com", lower-cased. */
export function bareAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}
