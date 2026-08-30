import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every server function must declare an auth middleware.
 *
 * The organization is derived in `ensureUserMiddleware`, which runs globally,
 * but a handler that never calls `requireAuthenticatedContext` receives an
 * unvalidated context shape. This is a static check rather than a runtime one
 * because the failure it guards against is a new file forgetting the pattern,
 * which no runtime test would ever reach.
 */

const DIR = join(process.cwd(), "src", "serverFunctions");

// Infrastructure rather than endpoints.
const NOT_ENDPOINT_FILES = new Set([
  "middleware.ts",
  "projectContext.ts",
  "samAccess.ts",
]);

function endpointFiles() {
  return readdirSync(DIR).filter(
    (name) => name.endsWith(".ts") && !NOT_ENDPOINT_FILES.has(name),
  );
}

function serverFnBlocks(source: string) {
  // Each `createServerFn(...)` chain up to its `.handler(` is one endpoint.
  const blocks: string[] = [];
  const marker = "createServerFn(";
  let index = source.indexOf(marker);
  while (index !== -1) {
    const end = source.indexOf(".handler(", index);
    blocks.push(source.slice(index, end === -1 ? source.length : end));
    index = source.indexOf(marker, index + marker.length);
  }
  return blocks;
}

describe("server function authorization coverage", () => {
  const files = endpointFiles();

  it("finds the server function files", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it.each(files)("%s declares a middleware on every endpoint", (file) => {
    const source = readFileSync(join(DIR, file), "utf8");
    const blocks = serverFnBlocks(source);
    for (const block of blocks) {
      expect(
        block.includes(".middleware("),
        `an endpoint in ${file} declares no middleware`,
      ).toBe(true);
    }
  });

  it.each(files)("%s uses only the sanctioned middlewares", (file) => {
    const source = readFileSync(join(DIR, file), "utf8");
    for (const block of serverFnBlocks(source)) {
      if (!block.includes(".middleware(")) continue;
      const sanctioned =
        block.includes("requireAuthenticatedContext") ||
        block.includes("requireProjectContext") ||
        block.includes("requireSamAccess");
      expect(
        sanctioned,
        `an endpoint in ${file} uses an unrecognized middleware`,
      ).toBe(true);
    }
  });
});
