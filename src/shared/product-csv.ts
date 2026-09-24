/**
 * Reading a product catalogue out of a spreadsheet.
 *
 * Every shop already has its products somewhere — an export, a stocktake, a
 * page on its own website — and typing two hundred of them into a form one at
 * a time is the reason a catalogue never gets entered at all. This turns that
 * file into rows; the service decides what to do with them.
 *
 * Written by hand rather than with a library because the input is a file a
 * shopkeeper made: quoted commas and stray blank lines are ordinary, and a
 * dependency that throws on the third row helps nobody.
 */

export type ProductCsvRow = {
  name: string;
  sku: string;
  category?: string;
  price?: string;
  productUrl?: string;
  description?: string;
};

type ProductCsvResult = {
  rows: ProductCsvRow[];
  /** One line per row that could not be used, in the words a person needs. */
  problems: string[];
};

/** Splits one line, honouring "quoted, fields" and doubled "" escapes. */
export function splitCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "," || char === "\t") {
      cells.push(cell.trim());
      cell = "";
    } else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

const HEADINGS: Record<string, keyof ProductCsvRow> = {
  name: "name",
  product: "name",
  title: "name",
  sku: "sku",
  code: "sku",
  category: "category",
  type: "category",
  price: "price",
  "sale price": "price",
  url: "productUrl",
  producturl: "productUrl",
  "product url": "productUrl",
  link: "productUrl",
  description: "description",
};

/**
 * Rows from a pasted or uploaded file. The first line must name the columns;
 * order does not matter, and columns we do not know about are ignored so an
 * export with forty columns still works.
 */
export function parseProductCsv(text: string): ProductCsvResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return {
      rows: [],
      problems: ["Needs a heading row and at least one product."],
    };
  }
  const headings = splitCsvLine(lines[0]).map((cell) =>
    cell.toLowerCase().replace(/^﻿/, "").trim(),
  );
  const columns = headings.map((heading) => HEADINGS[heading]);
  if (!columns.includes("name") || !columns.includes("sku")) {
    return {
      rows: [],
      problems: [
        "The heading row needs at least a name column and a sku column.",
      ],
    };
  }

  const rows: ProductCsvRow[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const [index, line] of lines.slice(1).entries()) {
    const cells = splitCsvLine(line);
    const row: Partial<ProductCsvRow> = {};
    for (const [position, column] of columns.entries()) {
      if (column && cells[position]) row[column] = cells[position];
    }
    const where = `Row ${index + 2}`;
    if (!row.name || !row.sku) {
      problems.push(`${where}: skipped, it needs both a name and a SKU.`);
      continue;
    }
    const key = row.sku.toLowerCase();
    if (seen.has(key)) {
      problems.push(
        `${where}: skipped, SKU ${row.sku} appears twice in the file.`,
      );
      continue;
    }
    seen.add(key);
    rows.push({ ...row, name: row.name, sku: row.sku });
  }
  return { rows, problems };
}

/** "LKR 11,990.00" and "11990" both mean the same number of cents. */
export function priceToMinorUnits(price: string | undefined) {
  const digits = (price ?? "").replace(/[^0-9.]/g, "");
  if (!digits) return 0;
  const amount = Number(digits);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}
