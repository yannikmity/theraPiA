import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

// Die App bildet die deutsche PiA-Ausbildung ab: Kalendertage gelten in Europe/Berlin,
// unabhängig davon, in welcher Zeitzone der Server-Prozess läuft (Container laufen meist in UTC).
export const APP_TIME_ZONE = "Europe/Berlin";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Kalendertag eines Zeitpunkts in APP_TIME_ZONE als YYYY-MM-DD ("en-CA" formatiert so).
const berlinDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function isoDayInAppZone(instant: Date): string {
  const parts = berlinDay.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Anzeigeformat für Menschen. Gespeichert, in URLs und in Exporten bleibt alles YYYY-MM-DD.
// Reine Kalenderdaten (DATE-Spalten) werden ohne Verschiebung formatiert, Zeitstempel als Kalendertag in Europe/Berlin.
export function formatDateDe(iso: string): string {
  const day = DATE_ONLY.test(iso) ? iso : isoDayInAppZone(parseISO(iso));
  return format(parseISO(day), "dd.MM.yyyy");
}

// Heutiges Datum als YYYY-MM-DD, Kalendertag in Europe/Berlin.
export function todayIso(now: Date = new Date()): string {
  return isoDayInAppZone(now);
}

// Kalenderarithmetik auf YYYY-MM-DD-Strings – ohne Uhrzeit und ohne Zeitzonenversatz: parseISO liefert lokale
// Mitternacht, format liest sie lokal zurück; das Ergebnis ist unabhängig von der Zeitzone des Prozesses.
export function addDaysIso(iso: string, days: number): string {
  return format(addDays(parseISO(iso), days), "yyyy-MM-dd");
}

export function daysBetweenIso(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from));
}

// „Mo, 21.09.2026“ – für Listen, in denen der Wochentag die Orientierung gibt (Vorschläge „Wie letzte Woche“).
export function formatWeekdayDateDe(iso: string): string {
  return format(parseISO(iso), "EEEEEE, dd.MM.yyyy", { locale: de });
}
