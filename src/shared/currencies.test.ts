import { describe, expect, it } from "vitest";
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  currencyDigits,
  formatMoney,
  isCurrencyCode,
  normalizeCurrency,
  toMajorUnits,
  toMinorUnits,
} from "./currencies";

describe("the currency list", () => {
  it("puts the three the workspace is used from at the top, in order", () => {
    expect(CURRENCIES.slice(0, 3).map((item) => item.code)).toEqual([
      "AUD",
      "LKR",
      "AED",
    ]);
  });

  it("defaults to Australian dollars", () => {
    expect(DEFAULT_CURRENCY).toBe("AUD");
  });

  it("lists every code once, as three uppercase letters", () => {
    const codes = CURRENCIES.map((item) => item.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(isCurrencyCode(code)).toBe(true);
  });
});

describe("smallest units are not always hundredths", () => {
  it("knows yen has no minor unit", () => {
    // Dividing by 100 would show 1,200 yen as ¥12.
    expect(currencyDigits("JPY")).toBe(0);
    expect(toMajorUnits(1200, "JPY")).toBe(1200);
  });

  it("knows a dinar has three", () => {
    expect(currencyDigits("KWD")).toBe(3);
    expect(toMajorUnits(1500, "KWD")).toBe(1.5);
  });

  it("treats the ordinary case as hundredths", () => {
    expect(toMajorUnits(150_000, "LKR")).toBe(1500);
    expect(toMinorUnits(1500, "LKR")).toBe(150_000);
  });

  it("assumes hundredths for a code it does not know", () => {
    // The amount was typed as major units regardless, so refusing it would
    // lose the value; two digits is right for the overwhelming majority.
    expect(currencyDigits("XYZ")).toBe(2);
  });

  it("round-trips a typed amount without floating point drift", () => {
    expect(toMinorUnits(19.99, "AUD")).toBe(1999);
    expect(toMajorUnits(1999, "AUD")).toBe(19.99);
    expect(toMinorUnits(0.1 + 0.2, "AUD")).toBe(30);
  });
});

describe("normalising what someone typed", () => {
  it("uppercases and trims a code", () => {
    expect(normalizeCurrency(" lkr ")).toBe("LKR");
  });

  it("falls back to the default rather than storing nonsense", () => {
    expect(normalizeCurrency("rupees")).toBe("AUD");
    expect(normalizeCurrency("")).toBe("AUD");
    expect(normalizeCurrency(null)).toBe("AUD");
  });
});

describe("money becomes text in exactly one place", () => {
  it("uses the workspace currency, not a hardcoded one", () => {
    expect(formatMoney(150_000, "LKR")).toContain("1,500");
    expect(formatMoney(150_000, "LKR")).not.toContain("A$");
  });

  it("does not show minor units for a currency that has none", () => {
    expect(formatMoney(1200, "JPY")).not.toContain(".");
  });

  it("still shows the amount for a code the runtime cannot name", () => {
    // A workspace on an unusual currency must see its numbers, not an error.
    // Intl separates the code with a non-breaking space, so compare loosely.
    const formatted = formatMoney(1999, "XYZ").replace(/\s/g, " ");
    expect(formatted).toBe("XYZ 19.99");
  });

  it("treats no amount as zero rather than blank", () => {
    expect(formatMoney(null, "AUD")).toContain("0");
  });
});
