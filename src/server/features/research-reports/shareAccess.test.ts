import { beforeEach, describe, expect, it, vi } from "vitest";
import { sharesEnabled, SHARE_TOKEN_PATTERN } from "./shareAccess";
const { getOptionalEnvValue } = vi.hoisted(() => ({
  getOptionalEnvValue: vi.fn(),
}));
vi.mock("@/server/lib/runtime-env", () => ({ getOptionalEnvValue }));
beforeEach(() => {
  getOptionalEnvValue.mockReset();
});
describe("research report share access", () => {
  it.each(["hosted", "selfhosted"])(
    "permits %s deployments with their own accounts",
    async (mode) => {
      getOptionalEnvValue.mockResolvedValue(mode);
      expect(await sharesEnabled()).toBe(true);
    },
  );
  it.each(["local_noauth", "cloudflare_access", undefined])(
    "does not enable public sharing in %s",
    async (mode) => {
      getOptionalEnvValue.mockResolvedValue(mode);
      expect(await sharesEnabled()).toBe(false);
    },
  );
  it("accepts only the exact minted token shape before a database read", () => {
    expect(SHARE_TOKEN_PATTERN.test("a".repeat(32))).toBe(true);
    expect(SHARE_TOKEN_PATTERN.test("a".repeat(31))).toBe(false);
    expect(SHARE_TOKEN_PATTERN.test("a".repeat(32) + "/raw")).toBe(false);
  });
});
