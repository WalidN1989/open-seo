import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The safety argument for these modules is that an agent *cannot* take certain
 * actions, because no such tool exists — not because a permission check says
 * no. A check can be misconfigured; an absent capability cannot.
 *
 * These assertions read the source rather than importing it, because importing
 * the tools pulls in the database provider and the worker runtime. The point
 * here is the shape of the surface, which the text answers directly.
 */
function source(file: string) {
  return readFileSync(join(process.cwd(), "src/server/mcp", file), "utf8");
}

const optimizations = source("tools/optimization-tools.ts");
const invoices = source("tools/invoice-tools.ts");
const server = source("server.ts");

function declaredToolNames(text: string) {
  return [...text.matchAll(/^\s*name: "([a-z_]+)",$/gm)].map(
    (match) => match[1]!,
  );
}

describe("the optimization MCP surface", () => {
  it("exposes exactly the tools an agent needs to propose work", () => {
    expect(declaredToolNames(optimizations).toSorted()).toEqual([
      "append_optimization_comment",
      "attach_optimization_brief",
      "attach_optimization_draft",
      "create_optimization_opportunity",
      "get_optimization_feedback",
      "list_optimization_opportunities",
    ]);
  });

  it("offers no way for an agent to approve, publish, or delete", () => {
    for (const name of declaredToolNames(optimizations)) {
      expect(name).not.toMatch(/approve|publish|delete|reject/);
    }
  });

  it("never reaches the service methods that approve or publish", () => {
    for (const method of ["approve", "beginPublish", "reject", "submitForReview"]) {
      expect(optimizations).not.toContain(`OptimizationService.${method}`);
    }
  });
});

describe("the invoice MCP surface", () => {
  it("reads invoices and writes only drafts", () => {
    expect(declaredToolNames(invoices).toSorted()).toEqual([
      "draft_invoice",
      "get_invoice",
      "list_invoices",
    ]);
  });

  it("offers no way to send an invoice, mark it paid, or void it", () => {
    for (const name of declaredToolNames(invoices)) {
      expect(name).not.toMatch(/paid|sent|send|void|delete|remove|settings/);
    }
  });

  it("never reaches the service methods that move money or settings", () => {
    // setStatus is how paid/sent/void happen; saveSettings holds the bank
    // details. Neither belongs behind a tool.
    for (const method of ["setStatus", "saveSettings", "remove"]) {
      expect(invoices).not.toContain(`InvoiceService.${method}`);
    }
  });

  it("does not hand an agent the bank details", () => {
    // get_invoice strips them; nothing else reads them.
    expect(invoices).toContain("bankDetails: _bank");
  });
});

describe("the module registry", () => {
  it("registers every surface it declares", () => {
    const surfaces = [
      ...server.matchAll(/^\s*(\w+Surface),$/gm),
    ].map((match) => match[1]!);
    expect(surfaces.toSorted()).toEqual([
      "invoiceSurface",
      "optimizationsSurface",
    ]);
  });

  it("makes each module state what it withholds and why", () => {
    for (const text of [optimizations, invoices]) {
      const withheld = text.slice(text.indexOf("withheld:"));
      expect(withheld).toContain("action:");
      expect(withheld).toContain("because:");
    }
  });
});
