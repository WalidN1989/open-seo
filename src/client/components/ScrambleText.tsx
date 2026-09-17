import * as React from "react";

/**
 * Text that resolves out of noise, left to right.
 *
 * The same effect as the headline on digitalurgency.lk: every character starts
 * as a random glyph and settles into place, so the line assembles itself while
 * the page is still arriving.
 *
 * The real sentence is always in the accessible tree — the animation runs in
 * an aria-hidden layer over it. A screen reader that read the scrambling would
 * announce a line of punctuation, and someone who has asked for less motion
 * gets the finished text immediately.
 */

/** Digits and typographic symbols, which is what the .lk headline flickers. */
const GLYPHS = "0123456789§≠~÷·|@$%&±×=+*^?#/\\[]{}<>";

/** Milliseconds each character spends unresolved before the wave passes it. */
const HOLD = 34;
function randomGlyph() {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function ScrambleText({
  text,
  delay = 0,
  className,
}: {
  text: string;
  /** Wait before starting, so several lines can resolve in sequence. */
  delay?: number;
  className?: string;
}) {
  // Server-rendered as the finished sentence: the scramble is decoration, and
  // a login page whose headline arrives as punctuation is worse than one with
  // no effect at all.
  const [shown, setShown] = React.useState(text);

  React.useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(text);
      return;
    }
    let frame = 0;
    let start: number | null = null;
    const step = (now: number) => {
      start ??= now + delay;
      const elapsed = now - start;
      if (elapsed < 0) {
        frame = requestAnimationFrame(step);
        return;
      }
      // One wave sweeps left to right; a character is final once the wave has
      // passed it, and flickers until then. Spaces are left alone so the shape
      // of the line never jumps.
      const settled = elapsed / HOLD;
      // split("") rather than spreading: the headline is plain Latin text, and
      // code-point splitting is the thing that breaks on an emoji anyway.
      const next = text
        .split("")
        .map((character, index) => {
          if (character === " " || index < settled) return character;
          return randomGlyph();
        })
        .join("");
      setShown(next);
      if (settled <= text.length) frame = requestAnimationFrame(step);
      else setShown(text);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [delay, text]);

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>{shown}</span>
    </span>
  );
}
