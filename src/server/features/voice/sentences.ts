/**
 * Cutting a reply into speakable pieces as it is written.
 *
 * The agent used to be silent until its whole answer existed, then silent
 * again while that answer was turned into audio. Speaking the first sentence
 * while the rest is still being written is most of the wait, gone.
 *
 * A piece is only cut at an end mark that really ends a sentence — not the
 * dot in "3.5", not the one in "e.g." — and never so short that the voice
 * clips a word or two and stops.
 */

/** Below this, a piece is held back and joined to the next one. */
const MIN_CHARS = 12;

const ABBREVIATION =
  /\b(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e|no|fig|approx)\.$/i;

function endsSentence(text: string, index: number) {
  const mark = text[index];
  if (mark === "\n") return true;
  if (mark !== "." && mark !== "!" && mark !== "?") return false;
  const next = text[index + 1];
  // A mark inside a number or a word — "3.5", "digitalurgency.lk" — is not an end.
  if (next && !/[\s"')\]]/.test(next)) return false;
  const before = text.slice(0, index + 1);
  return !ABBREVIATION.test(before.trimEnd());
}

/**
 * Splits what has arrived so far into finished sentences and the unfinished
 * remainder, which the caller keeps and passes back with the next delta.
 */
export function takeSentences(buffer: string) {
  const sentences: string[] = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (!endsSentence(buffer, index)) continue;
    const piece = buffer.slice(start, index + 1).trim();
    if (piece.length < MIN_CHARS) continue;
    sentences.push(piece);
    start = index + 1;
  }
  return { sentences, rest: buffer.slice(start) };
}

/** What is left when the model stops: spoken as one last piece, if anything. */
export function finalSentence(rest: string) {
  const piece = rest.trim();
  return piece.length > 0 ? piece : null;
}

/**
 * The words as they should be heard: addresses are read out as noise, so the
 * same stripping the one-shot path did applies to every piece.
 */
export function speakable(text: string) {
  return text
    .replaceAll(/https?:\/\/\S+/g, "")
    .replaceAll(/\s{2,}/g, " ")
    .trim();
}
