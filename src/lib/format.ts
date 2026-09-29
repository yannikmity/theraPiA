// Geldbeträge für die Anzeige: deutsche Tausenderpunkte, ganze Euro, „EUR“ statt Symbol – wie die Finanzen-Seite.
// `|| 0` macht aus -0 (z. B. Math.round(-0.4)) eine 0, sonst stünde „-0 EUR“ da.
export function formatEuro(value: number): string {
  const rounded = Math.round(value) || 0;
  return `${rounded.toLocaleString("de-DE")} EUR`;
}

// Beträge auf den Cent ohne Einheit: „85,00“, „1.234,56“ – deutsch mit Tausenderpunkt (anders als formatDecimal aus csv).
// signDisplay "negative" zeigt -0 und auf 0,00 gerundete negative Werte als „0,00“ statt „-0,00“.
export function formatCents(value: number): string {
  return value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "negative" });
}

// „1 Sitzung“, „2 Sitzungen“, „0 Sitzungen“ – für Meldungen und Nachfragen (kein „1 Sitzungen“, kein „Sitzung(en)“).
// Zahlen deutsch (Dezimalkomma, Tausenderpunkt); Singular nur bei genau 1 oder −1, gebrochene Werte im Plural (#57).
export function countNoun(n: number, singular: string, plural: string): string {
  return `${n.toLocaleString("de-DE")} ${Math.abs(n) === 1 ? singular : plural}`;
}

// Verhältnis-Schwelle „1 : x“ (#8): ganze Zahlen ohne Komma („4“ wie bisher), sonst eine Nachkommastelle („3,5“).
export function formatVerhaeltnis(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}

// Zahleneingaben in Formularen, deutsche Schreibweise: Komma trennt Dezimalstellen, Punkte nur als Tausendertrenner in
// Dreiergruppen („1.000,50“). Alles andere – leer, „200.5“, „1.00“ – wird NaN und vom Server-Schema als „Bitte eine
// Zahl eingeben“ am Feld gemeldet, statt still falsch gelesen zu werden (sonst würde aus „1.000“ die Zahl 1).
const ZAHL_DE = /^-?(\d+|\d{1,3}(\.\d{3})+)(,\d+)?$/;

export function parseZahlDe(text: string): number {
  const t = text.trim();
  return ZAHL_DE.test(t) ? Number(t.replaceAll(".", "").replace(",", ".")) : Number.NaN;
}

// Gegenstück für die Vorbelegung von Eingabefeldern: Komma, kein Tausenderpunkt („1000“, „3,5“).
export function formatZahlDe(wert: number): string {
  return String(wert).replace(".", ",");
}
