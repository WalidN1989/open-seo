/** Explicit personal financial solicitation; business payments remain eligible. */
export function isPersonalMoneyRequest(body: string): boolean {
  const text = body.toLowerCase().replace(/[’']/g, "");
  // Returning a customer's own payment is a business enquiry.
  if (/\b(?:refund|money back|cash back)\b/.test(text)) return false;
  return [
    /\b(?:give|send|lend|donate|spare)\s+(?:me|us)\s+(?:some\s+|a little\s+|any\s+)?(?:money|cash)\b/,
    /\b(?:help|support)\s+(?:me|us|my family)\s+(?:financially|with money)\b/,
    /\b(?:i|we)\s+(?:need|want)\s+(?:some\s+)?(?:financial (?:help|assistance|support)|money for (?:food|rent|school|my family))\b/,
    /\b(?:financial condition|financial situation)\b.{0,100}\b(?:bad|poor|difficult)\b.{0,100}\b(?:help|support)\s+(?:me|us)\b/,
  ].some((pattern) => pattern.test(text));
}
