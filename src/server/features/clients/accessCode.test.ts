import { describe, expect, it } from "vitest";
import {
  codeHint,
  codesMatch,
  formatAccessCode,
  generateAccessCode,
  generateSalt,
  hashAccessCode,
  normalizeAccessCode,
} from "./accessCode";

const AMBIGUOUS = ["0", "O", "1", "I", "L", "U"];

describe("generating a code", () => {
  it("avoids every character people misread aloud", () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const code = generateAccessCode();
      expect(code).toHaveLength(8);
      for (const character of AMBIGUOUS) {
        expect(code).not.toContain(character);
      }
    }
  });

  it("does not repeat itself", () => {
    const codes = new Set(
      Array.from({ length: 200 }, () => generateAccessCode()),
    );
    // 30^8 is large enough that 200 draws colliding would mean the generator
    // is not random at all.
    expect(codes.size).toBe(200);
  });

  it("is not guessable from a sequence", () => {
    const first = generateAccessCode();
    const second = generateAccessCode();
    expect(first).not.toBe(second);
  });
});

describe("reading a code back", () => {
  it("accepts what a person actually types", () => {
    for (const typed of [
      "k7qm3xpt",
      "K7QM-3XPT",
      " K7QM 3XPT ",
      "K7QM.3XPT",
      "k7qm–3xpt",
    ]) {
      expect(normalizeAccessCode(typed)).toBe("K7QM3XPT");
    }
  });

  it("shows a code in halves so it can be read out", () => {
    expect(formatAccessCode("K7QM3XPT")).toBe("K7QM-3XPT");
  });

  it("leaves an unexpected length alone rather than mangling it", () => {
    expect(formatAccessCode("ABC")).toBe("ABC");
  });

  it("hints at a code without revealing it", () => {
    const hint = codeHint("K7QM3XPT");
    expect(hint.startsWith("K7")).toBe(true);
    expect(hint).not.toContain("QM3XPT");
  });
});

describe("hashing", () => {
  it("verifies the code it was made from", async () => {
    const code = generateAccessCode();
    const salt = generateSalt();
    const hash = await hashAccessCode(code, salt);
    expect(codesMatch(await hashAccessCode(code, salt), hash)).toBe(true);
  });

  it("accepts the code however the client typed it", async () => {
    const salt = generateSalt();
    const hash = await hashAccessCode("K7QM3XPT", salt);
    expect(codesMatch(await hashAccessCode("k7qm-3xpt", salt), hash)).toBe(
      true,
    );
  });

  it("rejects a different code", async () => {
    const salt = generateSalt();
    const hash = await hashAccessCode("K7QM3XPT", salt);
    expect(codesMatch(await hashAccessCode("K7QM3XPQ", salt), hash)).toBe(
      false,
    );
  });

  it("gives two accounts different hashes for the same code", async () => {
    const a = await hashAccessCode("K7QM3XPT", generateSalt());
    const b = await hashAccessCode("K7QM3XPT", generateSalt());
    // Without a per-account salt, one cracked code would crack every account
    // that happened to share it.
    expect(a).not.toBe(b);
  });

  it("never stores anything resembling the code", async () => {
    const hash = await hashAccessCode("K7QM3XPT", generateSalt());
    expect(hash).not.toContain("K7QM");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("comparing", () => {
  it("matches only identical values", () => {
    expect(codesMatch("abc", "abc")).toBe(true);
    expect(codesMatch("abc", "abd")).toBe(false);
    expect(codesMatch("abc", "ab")).toBe(false);
    expect(codesMatch("", "")).toBe(true);
  });
});
