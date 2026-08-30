/**
 * The workspace currency.
 *
 * Money is stored as an integer in the currency's smallest unit. How many of
 * those make one major unit is not always a hundred: yen has none, Kuwaiti
 * dinar has a thousand. Dividing everything by 100 would show ¥1,200 as ¥12,
 * so the exponent travels with the currency rather than being assumed.
 */

type Currency = {
  code: string;
  name: string;
  /** Digits after the decimal point. 2 for most, 0 for yen, 3 for dinar. */
  digits: number;
};

/**
 * The three the workspace is actually used from come first; the rest are
 * alphabetical. Anything not listed can still be entered by its ISO code.
 */
export const CURRENCIES: readonly Currency[] = [
  { code: "AUD", name: "Australian dollar", digits: 2 },
  { code: "LKR", name: "Sri Lankan rupee", digits: 2 },
  { code: "AED", name: "UAE dirham", digits: 2 },
  { code: "BHD", name: "Bahraini dinar", digits: 3 },
  { code: "CAD", name: "Canadian dollar", digits: 2 },
  { code: "CHF", name: "Swiss franc", digits: 2 },
  { code: "CNY", name: "Chinese yuan", digits: 2 },
  { code: "EUR", name: "Euro", digits: 2 },
  { code: "GBP", name: "British pound", digits: 2 },
  { code: "INR", name: "Indian rupee", digits: 2 },
  { code: "JPY", name: "Japanese yen", digits: 0 },
  { code: "KWD", name: "Kuwaiti dinar", digits: 3 },
  { code: "MYR", name: "Malaysian ringgit", digits: 2 },
  { code: "NZD", name: "New Zealand dollar", digits: 2 },
  { code: "OMR", name: "Omani rial", digits: 3 },
  { code: "PKR", name: "Pakistani rupee", digits: 2 },
  { code: "QAR", name: "Qatari riyal", digits: 2 },
  { code: "SAR", name: "Saudi riyal", digits: 2 },
  { code: "SGD", name: "Singapore dollar", digits: 2 },
  { code: "THB", name: "Thai baht", digits: 2 },
  { code: "USD", name: "US dollar", digits: 2 },
  { code: "ZAR", name: "South African rand", digits: 2 },
];

export const DEFAULT_CURRENCY = "AUD";

/** Three letters, as ISO 4217 defines them. */
export function isCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

export function normalizeCurrency(value: string | null | undefined): string {
  const code = (value ?? "").trim().toUpperCase();
  return isCurrencyCode(code) ? code : DEFAULT_CURRENCY;
}

/**
 * A currency entered by code rather than picked from the list still needs an
 * exponent. Two is right for the overwhelming majority, and it is what the
 * amount was entered as, so an unknown code is treated that way rather than
 * refused.
 */
export function currencyDigits(code: string): number {
  return CURRENCIES.find((item) => item.code === code)?.digits ?? 2;
}

export function currencyName(code: string): string {
  return CURRENCIES.find((item) => item.code === code)?.name ?? code;
}

/** Smallest units -> major units, without ever going through a float twice. */
export function toMajorUnits(minor: number, code: string): number {
  return minor / 10 ** currencyDigits(code);
}

/** Major units as typed by a person -> the integer we store. */
export function toMinorUnits(major: number, code: string): number {
  if (!Number.isFinite(major)) return 0;
  return Math.round(major * 10 ** currencyDigits(code));
}

/**
 * The one place money becomes text. Falls back to the plain number if the
 * runtime does not recognise the code, so a workspace using an unusual
 * currency still sees its amounts rather than an error.
 */
export function formatMoney(
  minor: number | null | undefined,
  code: string,
  options: { compact?: boolean } = {},
): string {
  const digits = currencyDigits(code);
  const major = (minor ?? 0) / 10 ** digits;
  const fraction = options.compact ? 0 : digits;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      minimumFractionDigits: fraction,
      maximumFractionDigits: fraction,
    }).format(major);
  } catch {
    return `${code} ${major.toFixed(fraction)}`;
  }
}
