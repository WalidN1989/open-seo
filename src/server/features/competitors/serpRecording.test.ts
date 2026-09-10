import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every SERP the app buys must be recorded.
 *
 * A live SERP is the most expensive call the product makes and the shortest
 * lived — read once for one screen and thrown away. This existed as a habit
 * and the habit was already broken once: the agent-facing tool spent credits
 * for months and taught the project nothing about its competitors.
 *
 * A static check rather than a runtime one, because the failure it guards
 * against is a new call site written next year by somebody who never read
 * this file.
 */

const ROOT = join(process.cwd(), "src", "server");
const CALL = /\.serp\.live\(/;
const RECORDS = /recordSerpObservations/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
  });
}

describe("paid search results", () => {
  const callers = sourceFiles(ROOT).filter((path) =>
    CALL.test(readFileSync(path, "utf8")),
  );

  it("finds the known call sites", () => {
    // If this drops to zero the pattern has changed and the guard below is
    // silently passing without checking anything.
    expect(callers.length).toBeGreaterThanOrEqual(3);
  });

  it.each(callers)("%s records what the SERP showed", (path) => {
    const source = readFileSync(path, "utf8");
    expect(
      RECORDS.test(source),
      `${path} calls serp.live without recordSerpObservations, so the credits it spends teach the project nothing`,
    ).toBe(true);
  });
});
