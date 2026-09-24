/**
 * Plays a reply's sentences in order as they arrive.
 *
 * The agent answers in pieces now, and they land while the first is still
 * playing. Each is queued and played back to back, so it sounds like one
 * answer rather than a series of clips — and the whole queue can be cut off
 * the instant the person talks over it.
 */
export class SpeechQueue {
  private readonly clips: HTMLAudioElement[] = [];
  private playing: HTMLAudioElement | null = null;
  private ended = false;
  private stopped = false;
  private onFinished: (() => void) | null = null;

  /** Adds one sentence; starts playing if nothing is. */
  push(audioBase64: string, mimeType: string) {
    if (this.stopped) return;
    const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
    audio.addEventListener("ended", () => this.next());
    // A clip the browser refuses is skipped rather than stalling the reply.
    audio.addEventListener("error", () => this.next());
    this.clips.push(audio);
    if (!this.playing) this.next();
  }

  /** No more sentences are coming; finish what is queued. */
  finish(onFinished: () => void) {
    this.ended = true;
    this.onFinished = onFinished;
    if (!this.playing && this.clips.length === 0) this.settle();
  }

  /** Whether anything is being played right now. */
  get isSpeaking() {
    return this.playing !== null;
  }

  /** Silences the reply at once — the person is talking. */
  stop() {
    this.stopped = true;
    this.playing?.pause();
    this.playing = null;
    this.clips.length = 0;
    this.onFinished = null;
  }

  private settle() {
    const done = this.onFinished;
    this.onFinished = null;
    done?.();
  }

  private next() {
    if (this.stopped) return;
    const clip = this.clips.shift();
    if (!clip) {
      this.playing = null;
      if (this.ended) this.settle();
      return;
    }
    this.playing = clip;
    void clip.play().catch(() => this.next());
  }
}
