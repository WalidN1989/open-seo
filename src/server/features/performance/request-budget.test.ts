import { describe, expect, it } from "vitest";
import { claimJevRequest } from "./request-budget";
describe("Jev request budget", () => {
  it("limits repeat requests without blocking another user and expires the window", () => {
    for (let i = 0; i < 6; i++) claimJevRequest("user-a", 1000);
    expect(() => claimJevRequest("user-a", 1001)).toThrow();
    expect(() => claimJevRequest("user-b", 1001)).not.toThrow();
    expect(() => claimJevRequest("user-a", 61_001)).not.toThrow();
  });
});
