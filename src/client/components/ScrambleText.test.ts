import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The component itself needs a browser to animate, so this pins the two
 * properties that matter and are easy to lose in a refactor: the real
 * sentence stays in the accessible tree, and someone who asked for less
 * motion never sees the scramble.
 */
const source = readFileSync("src/client/components/ScrambleText.tsx", "utf8");

describe("ScrambleText", () => {
  it("keeps the real text for screen readers and hides the noise", () => {
    expect(source).toContain('className="sr-only"');
    expect(source).toMatch(/<span aria-hidden>\{shown\}<\/span>/);
  });

  it("honours prefers-reduced-motion", () => {
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(source).toMatch(/if \(prefersReducedMotion\(\)\)/);
  });

  it("never scrambles spaces, so the line does not jump", () => {
    expect(source).toContain('character === " "');
  });
});
