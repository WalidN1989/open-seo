/**
 * The arithmetic on an invoice.
 *
 * Free of database and runtime imports so it can be tested directly: an
 * invoice that does not add up is worse than no invoice, and this is the one
 * part a person will check with a calculator.
 *
 * Money is in minor units (cents). Quantities are in thousandths, so 1.5 hours
 * is 1500 and never becomes 1.4999999999999998.
 */

export type LineInput = {
  quantityMilli: number;
  unitPriceMinor: number;
};

export type Totals = {
  lineAmountsMinor: number[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
};

/** Half-up, and symmetric about zero so a credit note rounds like an invoice. */
function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function lineAmountMinor(line: LineInput): number {
  return roundHalfUp((line.quantityMilli * line.unitPriceMinor) / 1000);
}

/**
 * Tax is calculated on the rounded subtotal, not summed per line.
 *
 * Per-line rounding then summing drifts by a cent or two against what a
 * reader gets when they check subtotal x rate, and the reader is right.
 */
export function computeTotals(
  lines: readonly LineInput[],
  taxRatePercent: number,
): Totals {
  const lineAmountsMinor = lines.map(lineAmountMinor);
  const subtotalMinor = lineAmountsMinor.reduce(
    (sum, amount) => sum + amount,
    0,
  );
  const rate = Number.isFinite(taxRatePercent) ? taxRatePercent : 0;
  const taxMinor = rate > 0 ? roundHalfUp((subtotalMinor * rate) / 100) : 0;
  return {
    lineAmountsMinor,
    subtotalMinor,
    taxMinor,
    totalMinor: subtotalMinor + taxMinor,
  };
}

/** `INV-0007` from prefix `INV` and 7. Padded so a list sorts as it reads. */
export function formatInvoiceNumber(prefix: string, sequence: number): string {
  const trimmed = prefix.trim();
  const padded = String(Math.max(1, Math.trunc(sequence))).padStart(4, "0");
  return trimmed ? `${trimmed}-${padded}` : padded;
}

export function formatMoney(minor: number, currency: string): string {
  const amount = minor / 100;
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(amount);
  } catch {
    // An unrecognised currency code should still print a readable number
    // rather than throwing on the page.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * What the document may be called.
 *
 * In Australia "Tax Invoice" is reserved for a business registered for GST,
 * and titling a document that way without registration misrepresents it — so
 * the heading follows the issuer's registration rather than their preference.
 */
export function documentHeading(input: {
  documentType: string;
  taxRegistered: boolean;
}): string {
  if (input.documentType === "proforma") return "Proforma Invoice";
  if (input.documentType === "credit_note") return "Credit Note";
  return input.taxRegistered ? "Tax Invoice" : "Invoice";
}
