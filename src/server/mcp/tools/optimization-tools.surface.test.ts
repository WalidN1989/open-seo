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
const reports = source("tools/report-tools.ts");
const email = source("tools/email-tools.ts");
const quotes = source("tools/quote-tools.ts");
// The CRM surface spans two files: the client-login reader lives on its own
// so neither grows past the line limit. Both are read, or a tool could be
// added out of sight of this test.
const crm =
  source("tools/crm-tools.ts") + source("tools/client-login-tools.ts");
const whatsapp = source("tools/whatsapp-tools.ts");
const sms = source("tools/sms-tools.ts");
const server = source("server.ts");

function declaredToolNames(text: string) {
  return [...text.matchAll(/^\s*name: "([a-z_]+)",$/gm)].map(
    (match) => match[1],
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
    for (const method of [
      "approve",
      "beginPublish",
      "reject",
      "submitForReview",
    ]) {
      expect(optimizations).not.toContain(`OptimizationService.${method}`);
    }
  });
});

describe("the invoice MCP surface", () => {
  it("reads invoices and writes only drafts", () => {
    expect(declaredToolNames(invoices).toSorted()).toEqual([
      "draft_invoice",
      "get_invoice",
      "get_invoice_document",
      "list_invoices",
    ]);
  });

  it("offers no way to send an invoice, mark it paid, or void it", () => {
    for (const name of declaredToolNames(invoices)) {
      expect(name).not.toMatch(/paid|sent|send|void|delete|remove|settings/);
    }
  });

  it("mints a document link only when asked, never on an ordinary read", () => {
    // get_invoice reports that a document exists; it does not hand out the
    // URL, because that page carries the payment details.
    const read = invoices.slice(
      invoices.indexOf("const getInvoiceTool ="),
      invoices.indexOf("const getInvoiceDocumentTool ="),
    );
    expect(read).toContain("documentAvailable: true");
    expect(read).not.toContain("documentLink");
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

describe("the quote MCP surface", () => {
  it("finds catalogue items and writes only drafts", () => {
    expect(declaredToolNames(quotes).toSorted()).toEqual([
      "draft_quote",
      "get_quote",
      "get_quote_document",
      "list_quotes",
      "search_quote_catalogue",
    ]);
  });

  it("offers no way to send, answer, invoice or delete a quote", () => {
    for (const name of declaredToolNames(quotes)) {
      expect(name).not.toMatch(
        /send|sent|accept|decline|status|convert|invoice|delete|remove|settings/,
      );
    }
  });

  it("never reaches the service methods that change a quote's standing", () => {
    for (const method of ["setStatus", "convertToInvoice", "remove"]) {
      expect(quotes).not.toContain(`QuoteFlowService.${method}`);
      expect(quotes).not.toContain(`QuoteService.${method}`);
    }
  });
});

describe("the CRM MCP surface", () => {
  it("reads leads and keeps the journal", () => {
    expect(declaredToolNames(crm).toSorted()).toEqual([
      "get_business_briefing",
      "get_lead",
      "list_client_logins",
      "list_leads",
      "log_lead_activity",
    ]);
  });

  it("cannot close, delete or message a lead", () => {
    for (const name of declaredToolNames(crm)) {
      expect(name).not.toMatch(/won|lost|close|delete|remove|send|message/);
    }
    const logSchema = crm.slice(
      crm.indexOf("const logInput ="),
      crm.indexOf("const logLeadActivityTool ="),
    );
    expect(logSchema).not.toContain('"won"');
    expect(logSchema).not.toContain('"lost"');
    expect(crm).not.toContain("CrmService.updateLead");
  });
});

describe("the WhatsApp MCP surface", () => {
  it("reads chats and follows up only through the rule-checked service", () => {
    expect(declaredToolNames(whatsapp).toSorted()).toEqual([
      "get_whatsapp_chat",
      "list_whatsapp_chats",
      "send_whatsapp_reply",
      "send_whatsapp_template",
    ]);
    // Sends go through WhatsappAgentService, which applies outreachDecision;
    // calling the raw provider or the unchecked service would skip the rules.
    expect(whatsapp).not.toContain("sendWhatsappText");
    expect(whatsapp).not.toContain("CommunicationsService.sendWhatsappMessage");
    for (const name of declaredToolNames(whatsapp)) {
      expect(name).not.toMatch(/campaign|template_create|connect|delete/);
    }
  });
});

describe("the SMS MCP surface", () => {
  it("reads conversations and texts back only through the rule-checked send", () => {
    expect(declaredToolNames(sms).toSorted()).toEqual([
      "get_sms_conversation",
      "list_sms_conversations",
      "send_sms",
    ]);
    // agentSend applies outreachDecision; the person-facing send does not.
    expect(sms).toContain("SmsService.agentSend");
    expect(sms).not.toContain("SmsService.send(");
    expect(sms).not.toContain("sendTwilioSms");
  });
});

describe("the module registry", () => {
  it("registers every surface it declares", () => {
    const surfaces = [...server.matchAll(/^\s*(\w+Surface),$/gm)].map(
      (match) => match[1],
    );
    expect(surfaces.toSorted()).toEqual([
      "crmSurface",
      "emailSurface",
      "invoiceSurface",
      "optimizationsSurface",
      "quoteSurface",
      "reportSurface",
      "smsSurface",
      "whatsappSurface",
    ]);
  });

  it("makes each module state what it withholds and why", () => {
    for (const text of [
      optimizations,
      invoices,
      reports,
      email,
      quotes,
      crm,
      whatsapp,
      sms,
    ]) {
      const withheld = text.slice(text.indexOf("withheld:"));
      expect(withheld).toContain("action:");
      expect(withheld).toContain("because:");
    }
  });
});
