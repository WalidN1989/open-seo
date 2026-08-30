import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The cutover and rollback instructions are operational safety, not prose.
 *
 * The first version of them was wrong in a way that would have cost an outage:
 * it said reverting the deployment restores service, which stops being true
 * the moment Meta is pointed at a route the previous release does not have.
 * These assertions keep the corrected shape from being edited away.
 */
const LEDGER = readFileSync(
  join(process.cwd(), "docs", "BUSINESS_MODULE_MIGRATION_SCOPE.md"),
  "utf8",
);

describe("the migration ledger documents the cutover", () => {
  it("names both platform secrets and the allowlist trap", () => {
    expect(LEDGER).toContain("META_APP_SECRET");
    expect(LEDGER).toContain("META_VERIFY_TOKEN");
    expect(LEDGER).toContain("scripts/write-runtime-dev-vars.ts");
  });

  it("tells the operator to record the old callback before changing it", () => {
    // Without it, the post-cutover rollback has only one option.
    expect(LEDGER).toMatch(
      /[Rr]ecord the current callback URL and verify token/,
    );
  });

  it("puts the backfill check before the deploy", () => {
    expect(LEDGER).toContain("db:check:meta-phones");
    expect(LEDGER.indexOf("db:check:meta-phones")).toBeLessThan(
      LEDGER.indexOf("Change the Meta Dashboard callback"),
    );
  });

  it("gives the stable callback path and the manual verification", () => {
    expect(LEDGER).toContain("/api/whatsapp/meta");
    expect(LEDGER).toContain("hub.verify_token");
  });
});

describe("the rollback is documented as two distinct stages", () => {
  it("separates before and after the Dashboard change", () => {
    expect(LEDGER).toContain("Before the Dashboard callback is changed");
    expect(LEDGER).toContain("After the Dashboard callback is changed");
  });

  it("says plainly that reverting alone is not enough after cutover", () => {
    expect(LEDGER).toMatch(/does not restore service/);
  });

  it("offers both post-cutover routes back", () => {
    expect(LEDGER).toMatch(/[Cc]hange the Meta Dashboard callback back/);
    expect(LEDGER).toMatch(/compatibility build/);
  });
});

describe("the ledger records what must never be logged", () => {
  it("states that secrets and message bodies stay out of logs", () => {
    expect(LEDGER).toMatch(
      /never carry a\s+secret, a message body or customer contact details/,
    );
  });

  it("keeps the criteria for retiring the legacy Meta route", () => {
    expect(LEDGER).toContain("url_connection_mismatch");
    expect(LEDGER).toMatch(/Twilio keeps that route permanently/);
  });
});
