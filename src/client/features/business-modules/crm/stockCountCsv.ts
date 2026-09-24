import { splitCsvLine } from "@/shared/product-csv";

/**
 * Counting on paper, or in a spreadsheet.
 *
 * Not every count is done with a scanner: a shop prints the list, walks the
 * shelves with a pen, and types the numbers in afterwards. The file that goes
 * out carries what stock currently says; the file that comes back carries
 * what was actually there.
 *
 * Pure: the screen does the downloading and the reading.
 */

type CountableRow = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  quantityOnHand: number;
};

const HEADERS = [
  "Product ID",
  "SKU",
  "Barcode",
  "Product",
  "In stock",
  "Counted",
];

function cell(value: string | number | null) {
  const text = String(value ?? "");
  // A comma or a quote in a book title must not split the row.
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** The counting sheet: every product, with an empty column to write in. */
export function toCountSheet(products: readonly CountableRow[]) {
  const rows = products.map((product) =>
    [
      product.id,
      product.sku,
      product.barcode ?? "",
      product.name,
      product.quantityOnHand,
      "",
    ]
      .map(cell)
      .join(","),
  );
  return [HEADERS.join(","), ...rows].join("\n");
}

type ParsedCount = { productId: string; counted: number };

type CountSheetResult = {
  counts: ParsedCount[];
  /** Rows that named no product this workspace has, or no number. */
  skipped: string[];
};

function headerIndex(header: string[], ...names: string[]) {
  const wanted = names.map((name) => name.toLowerCase());
  return header.findIndex((column) =>
    wanted.includes(column.trim().toLowerCase()),
  );
}

/**
 * Reads a returned sheet back.
 *
 * A row is matched on whichever of product id, SKU or barcode it carries, so
 * a sheet that has been through Excel — losing a column, reordering them —
 * still lands. A row with no count is not a count of zero; it is a product
 * nobody got to, and it is left alone.
 */
export function parseCountSheet(
  text: string,
  products: readonly CountableRow[],
): CountSheetResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return { counts: [], skipped: [] };
  const header = splitCsvLine(lines[0] ?? "");
  const at = {
    id: headerIndex(header, "product id", "productid", "id"),
    sku: headerIndex(header, "sku", "code"),
    barcode: headerIndex(header, "barcode", "isbn"),
    counted: headerIndex(header, "counted", "count", "counted qty", "quantity"),
  };
  if (at.counted < 0) return { counts: [], skipped: ["No 'Counted' column"] };

  const byId = new Map(products.map((product) => [product.id, product]));
  const bySku = new Map(
    products.map((product) => [product.sku.trim().toUpperCase(), product]),
  );
  const byBarcode = new Map(
    products.flatMap((product) =>
      product.barcode
        ? [[product.barcode.trim().toUpperCase(), product] as const]
        : [],
    ),
  );

  const counts = new Map<string, number>();
  const skipped: string[] = [];
  for (const line of lines.slice(1)) {
    const columns = splitCsvLine(line);
    const value = (index: number) =>
      index >= 0 ? (columns[index]?.trim() ?? "") : "";
    const counted = Number(value(at.counted));
    const product =
      byId.get(value(at.id)) ??
      bySku.get(value(at.sku).toUpperCase()) ??
      byBarcode.get(value(at.barcode).toUpperCase());
    if (!product) {
      const named = value(at.sku) || value(at.barcode) || value(at.id);
      if (named) skipped.push(named);
      continue;
    }
    // Blank means "not counted", which is not the same as counted zero.
    if (value(at.counted) === "" || !Number.isFinite(counted) || counted < 0) {
      continue;
    }
    counts.set(product.id, Math.round(counted));
  }
  return {
    counts: [...counts].map(([productId, counted]) => ({ productId, counted })),
    skipped,
  };
}
