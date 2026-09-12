import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every paid call must land in the ledger under a real name.
 *
 * The name is read off the picker's source, which cannot drift from the
 * function it describes — but it depends on every picker being written the
 * same way. A picker that did not match would still work, still charge, and
 * still write "unknown", which is the kind of failure nobody notices until
 * they go looking months later.
 *
 * Checked against the source rather than by calling the client, because
 * building one drags in the database and the worker runtime.
 */
const CLIENT = join(
  process.cwd(),
  "src",
  "server",
  "lib",
  "dataforseo",
  "client.ts",
);

/** The same expression the ledger uses. */
const NAME = /\.\s*([A-Za-z0-9_$]+)/;

describe("naming a paid endpoint", () => {
  const source = readFileSync(CLIENT, "utf8");
  const pickers = [...source.matchAll(/\(s\) => s\.[A-Za-z0-9_$]+/g)].map(
    (match) => match[0],
  );

  it("finds every picker in the client", () => {
    // If this drops the guard below is passing without checking anything.
    expect(pickers.length).toBeGreaterThan(20);
  });

  it.each(pickers)("%s yields a name", (picker) => {
    const name = NAME.exec(picker)?.[1];
    expect(name, `${picker} would be recorded as "unknown"`).toBeTruthy();
    expect(name).not.toBe("unknown");
  });
});
