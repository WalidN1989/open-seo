import { parse, type DefaultTreeAdapterMap } from "parse5";

// The report sandbox lives here so the two halves cannot drift: the header
// `/research-reports/<reportId>/raw` serves, and the `sandbox` attribute the in-app viewer puts on
// the iframe pointing at that same document. A report is a full HTML document
// written by a model from attacker-influenceable inputs (crawled pages, SERP
// titles, GSC queries), so it is treated as hostile in both cases.
//
// The `sandbox` directive is what makes the open-in-a-tab case safe: a
// top-level document has no iframe attribute, and the directive gives it an
// opaque origin anyway — no cookies, no localStorage, no same-origin access to
// the app.

// `allow-popups` plus `allow-popups-to-escape-sandbox` let a report's
// `target="_blank"` links open normally (the audited site, a reference);
// everything else stays restricted. `allow-same-origin` is never added: it
// would hand the frame the app's cookies and, with scripts, let the frame
// remove its own sandbox.
const SANDBOX = "allow-popups allow-popups-to-escape-sandbox";

/**
 * The iframe's `sandbox` attribute value. It allows scripts so the document's
 * own CSP decides, and that only ever lets the app's scripts run (see
 * reportCsp). The attribute must always be present — an absent `sandbox`
 * attribute is no sandbox at all.
 */
export const REPORT_IFRAME_SANDBOX = `allow-scripts ${SANDBOX}`;

// Reports are self-contained; network resources and active map widgets are disabled.
const CSP_TAIL =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'";

// A report's own JavaScript never runs: with no `script-src`,
// `default-src 'none'` blocks every script.
export const REPORT_CSP = `sandbox ${SANDBOX}; ${CSP_TAIL}`;

/**
 * The script print mode appends, and the only script authorized to run in a
 * report. It opens every closed `<details>` first, so an evidence appendix a
 * skill collapsed on screen still lands in the PDF, then waits a little after
 * `load` so fonts and images settle before the dialog snapshots the page. It is
 * injected with no attributes at all — see withPrintScript.
 */
export const PRINT_SCRIPT =
  'addEventListener("load",()=>{for(const d of document.querySelectorAll("details"))d.open=true;setTimeout(()=>print(),150)})';

/**
 * Base64 SHA-256 of PRINT_SCRIPT, for the `script-src` hash source. Hardcoded
 * rather than computed at module load: the digest is needed synchronously and
 * Web Crypto is async. report-sandbox.test.ts recomputes it from PRINT_SCRIPT,
 * so editing the script without editing this constant fails the suite instead
 * of silently breaking printing.
 */
export const PRINT_SCRIPT_SHA256 =
  "uE0MLbgBgIu3I3pghlY0762kVHKlP7Udz5qzZNT7piw=";

/**
 * The policy for one response: REPORT_CSP, byte for byte, unless the app adds
 * a script of its own. The print script is named by hash, so stored scripts
 * stay blocked however they are hidden.
 *
 * Print mode (`/research-reports/<id>/raw?print=1`) appends a `print()` call, so "Export" lands in
 * the browser's print dialog instead of asking the reader to find it. It also
 * needs `allow-modals`, since `print()` is a modal in a sandbox — see
 * withPrintScript.
 */
function reportCsp(options: { print?: boolean } = {}): string {
  const sources: string[] = [];
  if (options.print) sources.push(`'sha256-${PRINT_SCRIPT_SHA256}'`);
  if (sources.length === 0) return REPORT_CSP;
  const modals = options.print ? " allow-modals" : "";
  return `sandbox allow-scripts ${SANDBOX}${modals}; script-src ${sources.join(" ")}; ${CSP_TAIL}`;
}

/**
 * The plain-text response both report routes answer errors with: the sandbox
 * headers belong to the document, and these bodies are ours.
 */
export function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * Appends PRINT_SCRIPT to a stored document, last so it runs after the page.
 * The splice happens without parsing a document we did not write, so a report
 * ending in a dangling `<script src="…" ` absorbs whatever we put on our tag;
 * an attribute-free tag gives such a document nothing but a valueless
 * attribute name, and printing simply no-ops there.
 */
function withPrintScript(html: string): string {
  const tag = `<script>${PRINT_SCRIPT}</script>`;
  const bodyClose = html.lastIndexOf("</body>");
  if (bodyClose !== -1)
    return html.slice(0, bodyClose) + tag + html.slice(bodyClose);
  const htmlClose = html.lastIndexOf("</html>");
  if (htmlClose !== -1)
    return html.slice(0, htmlClose) + tag + html.slice(htmlClose);
  return html + tag;
}

// Print mode enables only the application's hashed script. Browsers also use
// allow-scripts to permit meta refresh, so remove those parsed tags before
// enabling it. Use the browser HTML5 parsing rules rather than matching attacker-written HTML
// with a regex (quoted > characters and entities are legal in attributes).
function withoutRefreshMeta(html: string): string {
  const ranges: { start: number; end: number }[] = [];
  const document = parse(html, {
    sourceCodeLocationInfo: true,
    scriptingEnabled: true,
  });
  function visit(node: DefaultTreeAdapterMap["node"]) {
    if ("tagName" in node && node.tagName === "meta") {
      const directive = node.attrs.find(
        (attribute) => attribute.name === "http-equiv",
      )?.value;
      const location = node.sourceCodeLocation;
      if (directive?.trim().toLowerCase() === "refresh" && location) {
        ranges.push({ start: location.startOffset, end: location.endOffset });
      }
    }
    if ("childNodes" in node) for (const child of node.childNodes) visit(child);
  }
  visit(document);
  ranges.sort((a, b) => a.start - b.start);
  let result = html;
  for (const range of ranges.toReversed()) {
    result = result.slice(0, range.start) + result.slice(range.end);
  }
  return result;
}

/**
 * The one response both report documents are served with — `/research-reports/<id>/raw` for a
 * member and `/s/<token>/raw` for a link holder — so the sandbox, the print
 * script and the header set cannot drift between them. Only the cache scope
 * and the robots tag differ: the public document is the one search engines
 * could reach.
 */
export function reportDocumentResponse(
  html: string,
  options: {
    print?: boolean;
    cacheControl: string;
    noindex?: boolean;
  },
): Response {
  return new Response(
    options.print ? withPrintScript(withoutRefreshMeta(html)) : html,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": reportCsp({ print: options.print }),
        // The sandbox allows popups to escape, so a link in a report opens a
        // real page that would otherwise keep a handle on this tab and be able
        // to navigate it. COOP severs that handle. Ignored when framed, which is
        // what both viewers want.
        "Cross-Origin-Opener-Policy": "same-origin",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        ...(options.noindex ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
        "Cache-Control": options.cacheControl,
      },
    },
  );
}
