/**
 * Deciding whether an inbound message is someone sending their access code.
 *
 * This has to be conservative. A wrong guess costs an attempt, and enough
 * attempts lock the number out — so mistaking an ordinary word for a code
 * would lock out the very client trying to talk to us.
 *
 * The alphabet excludes only the ambiguous characters, so plenty of ordinary
 * eight-letter words are spellable in it — "FEEDBACK" is a whole valid code.
 * So shape alone is not enough either, and a candidate carries how sure we
 * are: four-and-four is unmistakably someone typing a code, a bare word is
 * only a guess. A guess that turns out to be right verifies them; a guess that
 * is wrong is just a message, and costs nothing.
 */

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CHAR = `[${ALPHABET}]`;

/** `W4KD-3TXR`, `W4KD 3TXR` — the way a code is written down and read back. */
const GROUPED = new RegExp(`\\b(${CHAR}{4})[-–—\\s](${CHAR}{4})\\b`, "i");

/** The whole message is the code and nothing else. */
const BARE = new RegExp(`^\\s*(${CHAR}{8})\\s*$`, "i");

type AccessCodeCandidate = {
  code: string;
  /**
   * Whether this is unambiguously someone sending a code. Only a deliberate
   * attempt may be refused out loud or counted towards the lockout.
   */
  deliberate: boolean;
};

export function findAccessCodeCandidate(
  body: string,
): AccessCodeCandidate | null {
  const text = body.trim();
  if (!text) return null;

  // "my code is W4KD-3TXR", "W4KD-3TXR thanks" — the separator is what makes
  // this a code rather than a word that happens to fit.
  const grouped = GROUPED.exec(text);
  if (grouped) {
    return {
      code: `${grouped[1]!}${grouped[2]!}`.toUpperCase(),
      deliberate: true,
    };
  }

  const bare = BARE.exec(text);
  if (bare) return { code: bare[1]!.toUpperCase(), deliberate: false };

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
