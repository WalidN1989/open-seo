/**
 * Deciding whether an inbound message is someone sending their access code.
 *
 * This has to be conservative. A wrong guess costs an attempt, and enough
 * attempts lock the number out — so mistaking an ordinary word for a code
 * would lock out the very client trying to talk to us.
 *
 * The alphabet excludes only the ambiguous characters, so
 * plenty of eight-letter English words are spellable in it ("BACKREST"). The
 * defence is not the character set but the shape: we only try when the message
 * looks like someone answering "what's your code?" — the code on its own, or
 * clearly set apart in four-and-four.
 */

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CHAR = `[${ALPHABET}]`;

/** `W4KD-3TXR`, `W4KD 3TXR` — the way a code is written down and read back. */
const GROUPED = new RegExp(`\\b(${CHAR}{4})[-–—\\s](${CHAR}{4})\\b`, "i");

/** The whole message is the code and nothing else. */
const BARE = new RegExp(`^\\s*(${CHAR}{8})\\s*$`, "i");

export function findAccessCodeCandidate(body: string): string | null {
  const text = body.trim();
  if (!text) return null;

  const bare = BARE.exec(text);
  if (bare) return bare[1]!.toUpperCase();

  // "my code is W4KD-3TXR", "W4KD-3TXR thanks" — the separator is what makes
  // this a deliberate code rather than a word that happens to fit.
  const grouped = GROUPED.exec(text);
  if (grouped) return `${grouped[1]!}${grouped[2]!}`.toUpperCase();

  return null;
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
