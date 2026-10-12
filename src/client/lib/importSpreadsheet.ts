import Papa from "papaparse";

export const IMPORT_FILE_TYPES =
  ".csv,.tsv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Excel stays in the browser; only the selected sheet's CSV reaches the server. */
export async function readImportFile(file: File) {
  if (file.size > 10_000_000)
    throw new Error("Choose a file smaller than 10 MB.");
  if (/\.(csv|tsv)$/i.test(file.name)) return file.text();
  if (!/\.xlsx$/i.test(file.name)) {
    throw new Error(
      "Use CSV or Excel (.xlsx). For .xls or Numbers, save as .xlsx or CSV first.",
    );
  }
  const { readSheet } = await import("read-excel-file/browser");
  const rows = await readSheet(file);
  return Papa.unparse(
    rows.map((row) =>
      row.map((cell) =>
        cell instanceof Date ? cell.toISOString() : (cell ?? ""),
      ),
    ),
  );
}
