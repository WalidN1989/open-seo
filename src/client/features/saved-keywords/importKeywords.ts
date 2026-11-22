import Papa from "papaparse";

/** Pasted CSV/TSV uses its first column; plain lists use one keyword per line. */
export function parseKeywordImport(text: string): string[] {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const delimiter = firstLine.includes("\t")
    ? "\t"
    : firstLine.includes(",")
      ? ","
      : "";
  const lines = delimiter
    ? Papa.parse<string[]>(text, { delimiter, skipEmptyLines: true }).data.map(
        (row) => row[0] ?? "",
      )
    : text.split(/\r?\n/);
  const seen = new Set<string>();
  return lines
    .map((line) => line.trim())
    .filter((keyword) => {
      const normalized = keyword.toLowerCase();
      if (
        !normalized ||
        normalized === "keyword" ||
        normalized === "keywords" ||
        seen.has(normalized)
      )
        return false;
      seen.add(normalized);
      return true;
    });
}
