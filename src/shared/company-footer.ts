type CompanyDetails = {
  legalName: string;
  addressLines: string | null;
  email: string | null;
  phone: string | null;
  taxIdLabel: string | null;
  taxIdValue: string | null;
};

/**
 * The company block at the foot of a quotation and its email: copyright,
 * registration, email, phone and address, from the invoicing settings. The
 * year is the document's own, so an old quote never changes its footer.
 */
export function companyFooterLines(
  company: CompanyDetails,
  year: number,
): string[] {
  const address = (company.addressLines ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(", ");
  return [
    company.legalName.trim()
      ? `© ${year} ${company.legalName.trim()}. All rights reserved.`
      : "",
    company.taxIdValue?.trim()
      ? `${company.taxIdLabel?.trim() ?? ""} ${company.taxIdValue.trim()}`.trim()
      : "",
    company.email?.trim() ?? "",
    company.phone?.trim() ?? "",
    address,
  ].filter(Boolean);
}

/** The year of an ISO date, or this year if it can't be read. */
export function yearOf(isoDate: string) {
  const year = Number(isoDate.slice(0, 4));
  return Number.isInteger(year) && year > 1900
    ? year
    : new Date().getFullYear();
}
