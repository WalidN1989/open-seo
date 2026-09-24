import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeCacheOnlyWindow,
  isCacheOnlyWindowOpen,
  openCacheOnlyWindow,
} from "./cacheOnlyWindow";

// A minimal window: the page path and the listeners the window registers.
class FakeWindow extends EventTarget {
  location = { pathname: "/p/one/keywords" };
}

describe("cache-only window", () => {
  let fake: FakeWindow;
  beforeEach(() => {
    vi.useFakeTimers();
    fake = new FakeWindow();
    vi.stubGlobal("window", fake);
  });
  afterEach(() => {
    closeCacheOnlyWindow();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("is closed until a page opens it", () => {
    expect(isCacheOnlyWindowOpen()).toBe(false);
    openCacheOnlyWindow();
    expect(isCacheOnlyWindowOpen()).toBe(true);
  });

  it.each(["pointerdown", "keydown", "popstate"])(
    "closes on the person's first %s",
    (type) => {
      openCacheOnlyWindow();
      fake.dispatchEvent(new Event(type));
      expect(isCacheOnlyWindowOpen()).toBe(false);
    },
  );

  it("does not follow the person to another page", () => {
    openCacheOnlyWindow();
    fake.location.pathname = "/p/one/domain";
    expect(isCacheOnlyWindowOpen()).toBe(false);
  });

  it("lapses after a minute", () => {
    openCacheOnlyWindow();
    vi.advanceTimersByTime(60_000);
    expect(isCacheOnlyWindowOpen()).toBe(false);
  });
});
