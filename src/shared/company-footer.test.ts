import { describe, expect, it } from "vitest";
import { companyFooterLines, yearOf } from "./company-footer";

describe("companyFooterLines", () => {
  it("lays out the company block from the invoicing settings", () => {
    expect(
      companyFooterLines(
        {
          legalName: "Digital Urgency Pty Ltd",
          addressLines: "2/84 Estramina Street\nOxley QLD 4075, Australia",
          email: "sales@digitalurgency.com.au",
          phone: "+61 423 950 993",
          taxIdLabel: "ABN",
          taxIdValue: "41 701 663 201 · ACN 701 663 201",
        },
        yearOf("2026-09-14"),
      ),
    ).toEqual([
      "© 2026 Digital Urgency Pty Ltd. All rights reserved.",
      "ABN 41 701 663 201 · ACN 701 663 201",
      "sales@digitalurgency.com.au",
      "+61 423 950 993",
      "2/84 Estramina Street, Oxley QLD 4075, Australia",
    ]);
  });

  it("leaves out what isn't set", () => {
    expect(
      companyFooterLines(
        {
          legalName: "Acme",
          addressLines: null,
          email: null,
          phone: " ",
          taxIdLabel: null,
          taxIdValue: null,
        },
        2026,
      ),
    ).toEqual(["© 2026 Acme. All rights reserved."]);
  });
});
