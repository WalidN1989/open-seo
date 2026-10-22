/** Verification starts only with an explicit command, never a code-shaped word. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CHAR = `[${ALPHABET}]`;
const SUBMISSION = new RegExp(
  `^/verify\\s+(${CHAR}{4})(?:[-–—]|\\s+)?(${CHAR}{4})[.!]?$`,
  "i",
);

export function findAccessCodeCandidate(body: string): { code: string } | null {
  const match = SUBMISSION.exec(body.trim());
  return match ? { code: `${match[1]}${match[2]}`.toUpperCase() } : null;
}

// Old transcripts can contain codes sent before /verify was required. Keep
// those out of model input without treating them as verification attempts.
const LEGACY_WHOLE = new RegExp(
  `^${CHAR}{4}(?:[-–—]|\\s+)?${CHAR}{4}[.!]?$`,
  "i",
);
const LEGACY_HYPHENATED = new RegExp(`\\b${CHAR}{4}[-–—]${CHAR}{4}\\b`, "i");

const LEGACY_SPACED = new RegExp(`\\b${CHAR}{4}\\s+${CHAR}{4}\\b`, "gi");

export function redactAccessCode(body: string): string {
  for (const match of body.matchAll(LEGACY_SPACED)) {
    if (/\d/.test(match[0]) || /\bcode\b/i.test(body)) {
      return "[Access code withheld]";
    }
  }
  return findAccessCodeCandidate(body) ||
    LEGACY_WHOLE.test(body.trim()) ||
    LEGACY_HYPHENATED.test(body)
    ? "[Access code withheld]"
    : body;
}

/**
 * Whether a message is asking about their own account.
 *
 * Only used to decide when to *offer* verification, never to decide what may
 * be revealed — that is the gate's job, and the gate does not consult this.
 */
const ACCOUNT_INTENT =
  /\b(my|our)\b.{0,20}\b(account|business|site|website|project|campaign|ranking|rankings|traffic|seo|report|results|performance)\b|\b(registered|existing)\s+(client|customer)\b/i;

export function looksLikeAccountEnquiry(body: string): boolean {
  return ACCOUNT_INTENT.test(body);
}
