/**
 * The quote as a PDF, drawn directly rather than printed from a browser.
 *
 * It has to exist on the server, because it is attached to an email nobody
 * clicks to generate. pdf-lib is plain JavaScript, so it runs in the worker.
 * The layout follows the on-screen quote: heading and meta, the two parties,
 * the total, one table, totals, terms, notes, and the validity line.
 */
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { formatMoney } from "@/server/features/invoicing/invoiceTotals";

type QuotePdfInput = {
  heading: string;
  quote: {
    number: string;
    title: string | null;
    clientName: string;
    clientAddressLines: string | null;
    clientEmail: string | null;
    currency: string;
    issueDate: string;
    validUntil: string;
    notes: string | null;
    terms: string | null;
    taxLabel: string | null;
    taxRatePercent: number;
    subtotalMinor: number;
    taxMinor: number;
    totalMinor: number;
  };
  issuer: {
    legalName: string;
    addressLines: string;
    email: string | null;
    phone: string | null;
    taxIdLabel: string | null;
    taxIdValue: string | null;
    taxRegistered: boolean;
    taxNote: string | null;
    footerNote: string | null;
  };
  lines: readonly {
    description: string;
    detail: string | null;
    quantityMilli: number;
    unitPriceMinor: number;
    amountMinor: number;
  }[];
};

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 56;
const INK = rgb(0.07, 0.07, 0.07);
const MUTED = rgb(0.42, 0.42, 0.42);
const RULE = rgb(0.85, 0.85, 0.85);

/**
 * The standard PDF fonts only carry Windows-1252. Anything outside it (an
 * emoji, a non-Latin name) becomes "?" instead of throwing mid-document.
 */
export function pdfSafe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\n -~ -ÿ–—€×]/g, "?");
}

function longDate(iso: string) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Break text into lines that fit a width, keeping the author's line breaks. */
export function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const out: string[] = [];
  for (const paragraph of pdfSafe(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) {
        line = next;
      } else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

class Writer {
  page: PDFPage;
  y: number;
  constructor(
    private readonly doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.page = doc.addPage([A4.width, A4.height]);
    this.y = A4.height - MARGIN;
  }

  /** Start a new page when the next block would run off this one. */
  ensure(height: number) {
    if (this.y - height >= MARGIN) return;
    this.page = this.doc.addPage([A4.width, A4.height]);
    this.y = A4.height - MARGIN;
  }

  text(
    value: string,
    x: number,
    options: {
      size?: number;
      font?: PDFFont;
      color?: typeof INK;
      right?: boolean;
    } = {},
  ) {
    const size = options.size ?? 10;
    const font = options.font ?? this.regular;
    const safe = pdfSafe(value);
    const left = options.right ? x - font.widthOfTextAtSize(safe, size) : x;
    this.page.drawText(safe, {
      x: left,
      y: this.y,
      size,
      font,
      color: options.color ?? INK,
    });
  }

  rule() {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: A4.width - MARGIN, y: this.y },
      thickness: 0.6,
      color: RULE,
    });
  }
}

function drawHeader(w: Writer, input: QuotePdfInput) {
  const right = A4.width - MARGIN;
  w.text(input.heading, MARGIN, { size: 22, font: w.bold });
  w.text(input.issuer.legalName, right, {
    size: 11,
    font: w.bold,
    right: true,
  });
  w.y -= 30;
  const meta: [string, string][] = [
    ["Quote number", input.quote.number],
    ["Date", longDate(input.quote.issueDate)],
    ["Valid until", longDate(input.quote.validUntil)],
  ];
  if (input.issuer.taxIdValue) {
    meta.push([
      input.issuer.taxIdLabel ?? "Registration",
      input.issuer.taxIdValue,
    ]);
  }
  for (const [label, value] of meta) {
    w.text(label, MARGIN, { size: 9, font: w.bold });
    w.text(value, MARGIN + 90, { size: 9 });
    w.y -= 14;
  }
  w.y -= 16;
}

function drawParties(w: Writer, input: QuotePdfInput) {
  const column = (A4.width - MARGIN * 2) / 2;
  const left = [
    input.issuer.addressLines,
    input.issuer.email ?? "",
    input.issuer.phone ?? "",
  ]
    .join("\n")
    .split("\n")
    .filter((line) => line.trim());
  const rightLines = [
    input.quote.clientAddressLines ?? "",
    input.quote.clientEmail ?? "",
  ]
    .join("\n")
    .split("\n")
    .filter((line) => line.trim());
  const top = w.y;
  w.text(input.issuer.legalName, MARGIN, { size: 10, font: w.bold });
  w.text("Prepared for", MARGIN + column, {
    size: 8,
    font: w.bold,
    color: MUTED,
  });
  w.y -= 13;
  w.text(input.quote.clientName, MARGIN + column, { size: 10, font: w.bold });
  const rows = Math.max(left.length, rightLines.length);
  for (let index = 0; index < rows; index += 1) {
    w.y -= 13;
    if (left[index]) w.text(left[index], MARGIN, { size: 9 });
    if (rightLines[index])
      w.text(rightLines[index], MARGIN + column, { size: 9 });
  }
  w.y = Math.min(w.y, top - 40) - 28;
}

function drawTable(w: Writer, input: QuotePdfInput) {
  const money = (minor: number) => formatMoney(minor, input.quote.currency);
  const right = A4.width - MARGIN;
  const cols = { qty: right - 190, unit: right - 90, amount: right };
  const descWidth = cols.qty - MARGIN - 40;

  w.text(`${money(input.quote.totalMinor)} ${input.quote.currency}`, MARGIN, {
    size: 18,
    font: w.bold,
  });
  w.y -= 18;
  if (input.quote.title) {
    w.text(input.quote.title, MARGIN, { size: 10, color: MUTED });
    w.y -= 14;
  }
  w.y -= 14;
  for (const [label, x, isRight] of [
    ["Description", MARGIN, false],
    ["Qty", cols.qty, true],
    ["Unit price", cols.unit, true],
    ["Amount", cols.amount, true],
  ] as const) {
    w.text(label, x, { size: 9, font: w.bold, color: MUTED, right: isRight });
  }
  w.y -= 8;
  w.rule();
  w.y -= 16;

  for (const line of input.lines) {
    const detail = line.detail
      ? wrapText(line.detail, w.regular, 8.5, descWidth)
      : [];
    const title = wrapText(line.description, w.regular, 10, descWidth);
    w.ensure(14 * title.length + 11 * detail.length + 14);
    const quantity = line.quantityMilli / 1000;
    w.text(
      Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2),
      cols.qty,
      { right: true },
    );
    w.text(money(line.unitPriceMinor), cols.unit, { right: true });
    w.text(money(line.amountMinor), cols.amount, { right: true });
    for (const part of title) {
      w.text(part, MARGIN);
      w.y -= 13;
    }
    for (const part of detail) {
      w.text(part, MARGIN, { size: 8.5, color: MUTED });
      w.y -= 11;
    }
    w.y -= 4;
    w.rule();
    w.y -= 16;
  }
}

function drawTotals(w: Writer, input: QuotePdfInput) {
  const money = (minor: number) => formatMoney(minor, input.quote.currency);
  const right = A4.width - MARGIN;
  const label = right - 200;
  w.ensure(60);
  w.text("Subtotal", label, { size: 10 });
  w.text(money(input.quote.subtotalMinor), right, { size: 10, right: true });
  w.y -= 16;
  if (input.quote.taxRatePercent > 0) {
    w.text(
      `${input.quote.taxLabel ?? "Tax"} (${input.quote.taxRatePercent}%)`,
      label,
      { size: 10 },
    );
    w.text(money(input.quote.taxMinor), right, { size: 10, right: true });
    w.y -= 16;
  }
  w.text("Total", label, { size: 11, font: w.bold });
  w.text(`${money(input.quote.totalMinor)} ${input.quote.currency}`, right, {
    size: 11,
    font: w.bold,
    right: true,
  });
  w.y -= 30;
}

function drawBlock(w: Writer, heading: string | null, body: string | null) {
  if (!body?.trim()) return;
  const width = A4.width - MARGIN * 2;
  const lines = wrapText(body, w.regular, 9, width);
  w.ensure(16 + lines.length * 12);
  if (heading) {
    w.text(heading, MARGIN, { size: 8, font: w.bold, color: MUTED });
    w.y -= 14;
  }
  for (const line of lines) {
    w.text(line, MARGIN, { size: 9 });
    w.y -= 12;
  }
  w.y -= 12;
}

export async function renderQuotePdf(
  input: QuotePdfInput,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`${input.heading} ${input.quote.number}`));
  doc.setAuthor(pdfSafe(input.issuer.legalName));
  const w = new Writer(
    doc,
    await doc.embedFont(StandardFonts.Helvetica),
    await doc.embedFont(StandardFonts.HelveticaBold),
  );
  drawHeader(w, input);
  drawParties(w, input);
  drawTable(w, input);
  drawTotals(w, input);
  drawBlock(w, "TERMS", input.quote.terms);
  drawBlock(w, null, input.quote.notes);
  const footer = [
    `This quote is valid until ${longDate(input.quote.validUntil)}. Prices may change after that date.`,
    input.issuer.taxRegistered
      ? ""
      : (input.issuer.taxNote ?? "No GST is included."),
    input.issuer.footerNote ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  w.ensure(40);
  w.rule();
  w.y -= 16;
  drawBlock(w, null, footer);
  return doc.save();
}
