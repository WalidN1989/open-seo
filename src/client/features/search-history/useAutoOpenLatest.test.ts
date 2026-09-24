import { describe, expect, it } from "vitest";
import { latestByTimestamp } from "./useAutoOpenLatest";

describe("latestByTimestamp", () => {
  it("picks the newest search even when the list is out of order", () => {
    // Server-merged history puts local-only items at the end.
    const history = [
      { q: "older", timestamp: 100 },
      { q: "newest", timestamp: 300 },
      { q: "middle", timestamp: 200 },
    ];
    expect(latestByTimestamp(history)?.q).toBe("newest");
  });

  it("has nothing to open with no history", () => {
    expect(latestByTimestamp([])).toBeNull();
  });
});
