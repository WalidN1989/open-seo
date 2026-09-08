/**
 * Access codes a client reads off a message and types back.
 *
 * Free of database imports so the generation, the formatting and the
 * comparison can be tested directly — this is the thing standing between a
 * stranger and a client's data, and it should be checkable without a fixture.
 */

/**
 * No 0/O, 1/I/L, or U — a code gets read aloud down a phone and typed on a
 * handset keyboard, and those are the characters people get wrong.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const LENGTH = 8;

const ENCODER = new TextEncoder();

/** High enough that a leaked table is not worth grinding through. */
const ITERATIONS = 100_000;

export function generateAccessCode(): string {
  const bytes = new Uint8Array(LENGTH);
  crypto.getRandomValues(bytes);
  // Rejection-free modulo is fine here: 256 % 30 skews the first 16 letters by
  // about 0.4%, which is far below what matters against a 30^8 space.
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

/** `K7QM-3XPT` — easier to read back than eight unbroken characters. */
export function formatAccessCode(code: string): string {
  const clean = normalizeAccessCode(code);
  return clean.length === LENGTH
    ? `${clean.slice(0, 4)}-${clean.slice(4)}`
    : clean;
}

/**
 * What someone typed, reduced to what they meant.
 *
 * People send back "k7qm 3xpt", "K7QM-3XPT", or with a stray full stop, so
 * case, spaces and punctuation are ignored. Nothing is folded beyond that: the
 * alphabet already leaves out every pair people confuse — no O against 0, no
 * I or L against 1 — so a character outside it is a genuine mistake rather
 * than something to guess at.
 */
export function normalizeAccessCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashAccessCode(
  code: string,
  salt: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    ENCODER.encode(normalizeAccessCode(code)),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: ENCODER.encode(salt),
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return [...new Uint8Array(bits)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant time, so a wrong code cannot be narrowed down by timing it. */
export function codesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

/** Enough to tell two codes apart in a list without revealing either. */
export function codeHint(code: string): string {
  return `${normalizeAccessCode(code).slice(0, 2)}••••••`;
}

/** Wrong attempts from one identity before it is refused for a while. */
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
