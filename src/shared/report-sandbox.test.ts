import { describe, expect, it } from "vitest";
import {
  PRINT_SCRIPT,
  PRINT_SCRIPT_SHA256,
  REPORT_CSP,
  REPORT_IFRAME_SANDBOX,
  reportDocumentResponse,
} from "./report-sandbox";
describe("research report sandbox", () => {
  it("keeps reports opaque and blocks scripts, network and forms", async () => {
    const hostile =
      '<html><body><script>parent.document.body.textContent="owned"</script><form action="/api/auth/sign-out"></form><img src="https://attacker.test/track"></body></html>';
    const response = reportDocumentResponse(hostile, {
      cacheControl: "private, no-store",
    });
    expect(await response.text()).toBe(hostile);
    expect(response.headers.get("Content-Security-Policy")).toBe(REPORT_CSP);
    expect(REPORT_CSP).toContain("default-src 'none'");
    expect(REPORT_CSP).toContain("connect-src 'none'");
    expect(REPORT_CSP).toContain("form-action 'none'");
    expect(REPORT_CSP).not.toContain("allow-same-origin");
    expect(REPORT_IFRAME_SANDBOX).not.toContain("allow-same-origin");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("Cross-Origin-Opener-Policy")).toBe(
      "same-origin",
    );
  });
  it("allows only the application print script by its exact hash", async () => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(PRINT_SCRIPT),
    );
    expect(btoa(String.fromCharCode(...new Uint8Array(digest)))).toBe(
      PRINT_SCRIPT_SHA256,
    );
    const response = reportDocumentResponse(
      "<html><body><script>alert(1)</script></body></html>",
      { print: true, cacheControl: "private, no-store" },
    );
    expect(response.headers.get("Content-Security-Policy")).toContain(
      `script-src 'sha256-${PRINT_SCRIPT_SHA256}'`,
    );
    expect(
      response.headers
        .get("Content-Security-Policy")
        ?.split("script-src ")[1]
        ?.split(";")[0],
    ).not.toContain("'unsafe-inline'");
    expect(await response.text()).toContain(
      `<script>${PRINT_SCRIPT}</script></body>`,
    );
  });
  it("removes refresh tags before enabling print, including entity and quote variants", async () => {
    const html =
      '<html><head><META content="0;url=https://attacker.test/?x=>" HTTP-EQUIV=" Refr&#101;sh "><meta http-equiv=refresh content="0;url=/canary"><meta name="description" content="keep me"></head><body>Evidence</body></html>';
    const response = reportDocumentResponse(html, {
      print: true,
      cacheControl: "private, no-store",
    });
    const body = await response.text();
    expect(body).not.toContain("attacker.test");
    expect(body).not.toContain("/canary");
    expect(body).toContain('<meta name="description" content="keep me">');
    expect(body).toContain("Evidence");
  });

  it("uses scripting-enabled HTML5 noscript parsing and first-attribute semantics", async () => {
    for (const html of [
      `<html><body><noscript><p title="</noscript><meta http-equiv=refresh content='0;url=/canary'>"><p>Evidence</p></body></html>`,
      `<html><head><meta http-equiv=refresh http-equiv=other content="0;url=/canary"></head><body>Evidence</body></html>`,
    ]) {
      const response = reportDocumentResponse(html, {
        print: true,
        cacheControl: "private, no-store",
      });
      expect(await response.text()).not.toContain("/canary");
    }
    const preserved = reportDocumentResponse(
      '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv=other http-equiv=refresh content="keep"></head><body>Evidence</body></html>',
      { print: true, cacheControl: "private, no-store" },
    );
    expect(await preserved.text()).toContain(
      '<meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv=other http-equiv=refresh content="keep">',
    );
  });
});
