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
