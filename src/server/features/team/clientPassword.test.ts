import { describe, expect, it } from "vitest";
import { generateClientPassword } from "./clientPassword";

describe("generateClientPassword", () => {
  it("is long, readable and different every time", () => {
    const passwords = Array.from({ length: 50 }, generateClientPassword);
    for (const password of passwords) {
      expect(password).toMatch(/^[A-Z][a-z]{5}-[a-z]{5}-\d{4}$/);
      expect(password.length).toBeGreaterThanOrEqual(12);
      // The characters people misread are left out on purpose.
      expect(password).not.toMatch(/[0O1lI]/);
    }
    expect(new Set(passwords).size).toBe(passwords.length);
  });
});
