// CSV für Excel mit deutscher Ländereinstellung: Semikolon als Trenner, Dezimalkomma, UTF-8 mit BOM,
// Zeilenende CRLF (RFC 4180). Datumswerte bleiben YYYY-MM-DD – Excel erkennt ISO-Daten, und die
// Werte entsprechen 1:1 den DATE-Spalten (kein Umrechnen, kein Zeitzonenversatz).
export const CSV_SEPARATOR = ";";
export const CSV_BOM = "\uFEFF";
export const CSV_LINE_BREAK = "\r\n";

export type CsvValue = string | number | boolean | null | undefined;

// Formel-Injektion: Excel und LibreOffice werten Zellen aus, die mit = + - @ (oder Tab/CR) beginnen.
// Ein vorangestelltes Hochkomma macht daraus Text. Gilt nur für Strings (Freitext, Namen, Chiffren);
// Zahlen formatiert diese Datei selbst und sie beginnen nie mit einem dieser Zeichen.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function formatDecimal(value: number, digits = 2): string {
  return value.toFixed(digits).replace(".", ",");
}

export function formatHours(minutes: number): string {
  return formatDecimal(minutes / 60);
}

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : formatDecimal(value);
  if (typeof value === "boolean") return value ? "ja" : "nein";
  const guarded = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  const needsQuotes = /[";\r\n]/.test(guarded) || guarded !== guarded.trim();
  return needsQuotes ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function csvLine(cells: CsvValue[]): string {
  return cells.map(csvCell).join(CSV_SEPARATOR);
}

export function toCsv(header: string[], rows: CsvValue[][]): string {
  return CSV_BOM + [header, ...rows].map(csvLine).join(CSV_LINE_BREAK) + CSV_LINE_BREAK;
}
