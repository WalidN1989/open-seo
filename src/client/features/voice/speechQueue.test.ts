import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpeechQueue } from "./speechQueue";

/** A stand-in for the browser's Audio: plays when told, ends when told. */
class FakeAudio {
  static made: FakeAudio[] = [];
  paused = false;
  played = false;
  private listeners = new Map<string, () => void>();
  constructor(readonly src: string) {
    FakeAudio.made.push(this);
  }
  addEventListener(name: string, run: () => void) {
    this.listeners.set(name, run);
  }
  play() {
    this.played = true;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  end() {
    this.listeners.get("ended")?.();
  }
}

describe("SpeechQueue", () => {
  beforeEach(() => {
    FakeAudio.made = [];
    vi.stubGlobal("Audio", FakeAudio);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("plays sentences one after another, in order", () => {
    const queue = new SpeechQueue();
    queue.push("one", "audio/mpeg");
    queue.push("two", "audio/mpeg");
    const [first, second] = FakeAudio.made;
    expect(first?.played).toBe(true);
    expect(second?.played).toBe(false);
    first?.end();
    expect(second?.played).toBe(true);
  });

  it("tells the caller only when the last sentence has played", () => {
    const queue = new SpeechQueue();
    const done = vi.fn();
    queue.push("one", "audio/mpeg");
    queue.push("two", "audio/mpeg");
    queue.finish(done);
    expect(done).not.toHaveBeenCalled();
    FakeAudio.made[0]?.end();
    expect(done).not.toHaveBeenCalled();
    FakeAudio.made[1]?.end();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("goes quiet at once when the person talks over it", () => {
    const queue = new SpeechQueue();
    const done = vi.fn();
    queue.push("one", "audio/mpeg");
    queue.push("two", "audio/mpeg");
    queue.finish(done);
    queue.stop();
    expect(FakeAudio.made[0]?.paused).toBe(true);
    queue.push("three", "audio/mpeg");
    expect(FakeAudio.made).toHaveLength(2);
    expect(done).not.toHaveBeenCalled();
  });

  it("finishes straight away when nothing was ever queued", () => {
    const queue = new SpeechQueue();
    const done = vi.fn();
    queue.finish(done);
    expect(done).toHaveBeenCalledTimes(1);
  });
});
