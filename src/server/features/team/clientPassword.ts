/**
 * The password a client is handed for their new login.
 *
 * Read aloud, retyped and pasted into a phone, so the alphabet leaves out the
 * characters people confuse — 0/O, 1/l/I — and the shape is fixed: letters,
 * digits and one separator, never a word.
 */

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";

function pick(alphabet: string, count: number) {
  return [...crypto.getRandomValues(new Uint32Array(count))]
    .map((value) => alphabet[value % alphabet.length])
    .join("");
}

export function generateClientPassword() {
  return `${pick(UPPER, 1)}${pick(LOWER, 5)}-${pick(LOWER, 5)}-${pick(DIGITS, 4)}`;
}
