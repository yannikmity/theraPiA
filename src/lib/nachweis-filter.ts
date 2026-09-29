import { format, isValid, parseISO } from "date-fns";
import type { NachweisFilter } from "./nachweis";
import { presetPeriod } from "./nachweis-periods";
import { nachweisFilterSchema } from "./validation";

export type NachweisSearchParams = Record<string, string | string[] | undefined>;

export interface ResolvedNachweisFilter {
  filter: NachweisFilter;
  // true: die Adresse enthielt ungültige Werte, angezeigt wird das aktuelle Quartal (die Seite sagt das).
  invalid: boolean;
}

// URL-Parameter → Filter. Fehlende Grenzen kommen aus dem aktuellen Quartal, eine leere Supervisor:in ist „alle“.
// Nur auf dem Server (Zod) – das Formular braucht nur nachweis-periods.
export function resolveNachweisFilter(params: NachweisSearchParams, today: Date): ResolvedNachweisFilter {
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const fallback: NachweisFilter = { ...presetPeriod("quartal", today, null), supervisorId: null };
  const parsed = nachweisFilterSchema.safeParse({
    from: one("from") ?? fallback.from,
    to: one("to") ?? fallback.to,
    supervisorId: one("supervisor") || null,
  });
  const valid = parsed.success && isCalendarDate(parsed.data.from) && isCalendarDate(parsed.data.to);
  return valid ? { filter: parsed.data, invalid: false } : { filter: fallback, invalid: true };
}

// Das Schema prüft nur die Form JJJJ-MM-TT; „2026-02-30“ oder „2026-13-01“ gibt es im Kalender nicht.
function isCalendarDate(date: string): boolean {
  const parsed = parseISO(date);
  return isValid(parsed) && format(parsed, "yyyy-MM-dd") === date;
}
