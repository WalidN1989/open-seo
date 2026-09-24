import { afterEach, describe, expect, it, vi } from "vitest";
import { cached, forgetCached } from "./cache";

describe("cached", () => {
  afterEach(() => {
    vi.useRealTimers();
    forgetCached("t:");
  });

  it("reads once and reuses the answer", async () => {
    const read = vi.fn(() => Promise.resolve("brief"));
    expect(await cached("t:one", read)).toBe("brief");
    expect(await cached("t:one", read)).toBe("brief");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("shares one read between turns that ask at the same moment", async () => {
    const read = vi.fn(() => Promise.resolve("brief"));
    await Promise.all([cached("t:two", read), cached("t:two", read)]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("reads again once it has gone stale", async () => {
    vi.useFakeTimers();
    const read = vi.fn(() => Promise.resolve("brief"));
    await cached("t:three", read, 1_000);
    vi.advanceTimersByTime(1_001);
    await cached("t:three", read, 1_000);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("does not keep a failed read", async () => {
    const read = vi.fn(() => Promise.reject(new Error("db asleep")));
    await expect(cached("t:four", read)).rejects.toThrow("db asleep");
    await expect(cached("t:four", read)).rejects.toThrow("db asleep");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("forgets a workspace on request", async () => {
    const read = vi.fn(() => Promise.resolve("brief"));
    await cached("t:five", read);
    forgetCached("t:five");
    await cached("t:five", read);
    expect(read).toHaveBeenCalledTimes(2);
  });
});
