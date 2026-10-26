/** Normalize spoken dimensions without guessing a different size or product variant. */
function tokens(value: string) {
  return (
    value
      .toLowerCase()
      .replaceAll("galvanized", "galvanised")
      .replace(/(\d)\s*[×x]\s*(?=\d)/g, "$1 ")
      .replace(/(\d)(mm|cm|m)\b/g, "$1 $2")
      .match(/[a-z]+|\d+(?:\.\d+)?/g) ?? []
  );
}
const ignored = new Set([
  "a",
  "an",
  "the",
  "of",
  "for",
  "price",
  "cost",
  "please",
]);
export function catalogueMatches<T extends { name: string; sku: string }>(
  products: T[],
  query: string,
) {
  const exact = products.filter(
    (p) => p.sku.toLowerCase() === query.trim().toLowerCase(),
  );
  if (exact.length) return exact;
  const terms = [...new Set(tokens(query).filter((t) => !ignored.has(t)))];
  if (!terms.length) return [];
  return products
    .filter((p) => {
      const words = new Set(tokens(`${p.name} ${p.sku}`));
      return terms.every((t) => words.has(t));
    })
    .slice(0, 10);
}
