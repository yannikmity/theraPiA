// Natürliche Sortierung nach deutschen Regeln: Zahlen im Text zählen als Zahlen („A-2“ vor „A-10“), Umlaute stehen
// im Alphabet. Für alles, was nach Chiffre oder Name sortiert wird – nicht für YYYY-MM-DD (dort reicht localeCompare).
const collator = new Intl.Collator("de", { numeric: true });

export function compareNatural(a: string, b: string): number {
  return collator.compare(a, b);
}
