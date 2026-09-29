// Pflichtdatum (YYYY-MM-DD aus <input type="date">), wortgleich mit dem Server-Schema (validation.ts). Die
// Bearbeiten-Formulare laufen mit noValidate – ohne diese Prüfung lehnte erst der Server ab, mit Meldung auf
// Formularebene statt am Feld (#56).
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function dateError(value: string): string | undefined {
  if (value.trim() === "") return "Bitte ein Datum angeben";
  if (!ISO_DATE.test(value)) return "Ungültiges Datumsformat";
  return undefined;
}
