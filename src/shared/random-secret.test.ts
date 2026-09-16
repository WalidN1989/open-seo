import { describe, expect, it } from "vitest";
import { randomSecret } from "./random-secret";

describe("randomSecret", () => {
  it("is hex, long enough to be a secret, and never the same twice", () => {
    const secret = randomSecret();
    expect(secret).toMatch(/^[0-9a-f]{48}$/);
    const many = new Set(Array.from({ length: 200 }, () => randomSecret()));
    expect(many.size).toBe(200);
  });

  it("takes a length in bytes", () => {
    expect(randomSecret(8)).toMatch(/^[0-9a-f]{16}$/);
  });
});
