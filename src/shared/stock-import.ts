import Papa from "papaparse";
import { z } from "zod";

const rowSchema = z
  .object({
    productId: z.string().max(100),
    sku: z.string().max(100),
    barcode: z.string().max(100),
    name: z.string().max(200),
    location: z.string().max(120),
    counted: z.number().int().min(0).max(10_000_000),
  })
  .refine(
    (row) => row.productId || row.sku || row.barcode,
    "Supply a product ID, SKU or barcode.",
  );

/** A snapshot, not stock movements: repeated identical rows are counted once. */
export function parseStockImport(csv: string) {
  const result = Papa.parse<string[]>(csv.trim(), { skipEmptyLines: "greedy" });
  if (result.errors.length)
    throw new Error("The CSV has invalid quoting or delimiters.");
  if (result.data.length > 1001)
    throw new Error("Import up to 1,000 rows at a time.");
  const header =
    result.data[0]?.map((cell) =>
      cell
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase(),
    ) ?? [];
  const column = (...names: string[]) =>
    header.findIndex((cell) => names.includes(cell));
  const at = {
    productId: column("product id", "productid", "id"),
    sku: column("sku", "code", "item code"),
    barcode: column("barcode", "isbn"),
    name: column("name", "product", "title", "item name", "product name"),
    location: column("location", "branch"),
    counted: column(
      "counted",
      "count",
      "counted qty",
      "quantity",
      "current stock",
    ),
  };
  if (at.counted < 0) throw new Error("Add a Counted or Current Stock column.");
  const rows: z.infer<typeof rowSchema>[] = [];
  const seen = new Map<string, z.infer<typeof rowSchema>>();
  let duplicates = 0;
  for (const [index, cells] of result.data.slice(1).entries()) {
    const value = (position: number) =>
      position < 0 ? "" : (cells[position]?.trim() ?? "");
    if (!value(at.counted)) continue;
    const row = rowSchema.safeParse({
      productId: value(at.productId),
      sku: value(at.sku),
      barcode: value(at.barcode),
      name: value(at.name),
      location: value(at.location),
      counted: Number(value(at.counted)),
    });
    if (!row.success)
      throw new Error(
        `Row ${index + 2}: use an identifier and a whole, non-negative count; names must be at most 200 characters.`,
      );
    const key = (
      row.data.productId ||
      row.data.sku ||
      row.data.barcode
    ).toUpperCase();
    const prior = seen.get(key);
    if (prior) {
      if (
        prior.counted !== row.data.counted ||
        prior.location !== row.data.location ||
        prior.name !== row.data.name
      ) {
        throw new Error(
          `Row ${index + 2}: conflicting entries for ${key}. Keep one count per product and location.`,
        );
      }
      duplicates += 1;
    } else {
      seen.set(key, row.data);
      rows.push(row.data);
    }
  }
  const locations = [
    ...new Set(rows.map((row) => row.location).filter(Boolean)),
  ];
  if (locations.length > 1)
    throw new Error("Import one location at a time into the selected branch.");
  if (!rows.length)
    throw new Error("No counts were found. Blank counts are left unchanged.");
  return { rows, duplicates, location: locations[0] ?? null };
}
