// Dauer in Minuten, wie das Server-Schema (validation.ts: ganzzahlig, 1 bis 480, wortgleiche Meldungen). Geprüft im
// Formular, damit bei „0“ oder leerem Feld eine eigene Meldung am Feld steht statt des Browser-Tooltips oder eines
// Feldfehlers vom Server (#28, #56).
export const DURATION_MIN_MINUTES = 1;
export const DURATION_MAX_MINUTES = 480;

export function durationError(value: string): string | undefined {
  if (value.trim() === "") return "Bitte eine Dauer angeben";
  const minutes = Number(value);
  if (!Number.isInteger(minutes)) return "Dauer in ganzen Minuten eingeben";
  if (minutes < DURATION_MIN_MINUTES) return `Dauer muss mindestens ${DURATION_MIN_MINUTES} Minute sein`;
  if (minutes > DURATION_MAX_MINUTES) return `Dauer darf höchstens ${DURATION_MAX_MINUTES} Minuten sein`;
  return undefined;
}
