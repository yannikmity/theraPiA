import { parseISO } from "date-fns";
import type { FinancialSettings, GroupSession, SupervisionSession, TherapySession } from "@/types";
import { calculateQuarterlyFinancesWithGroups, minutesToUnits, quarterOf } from "./calculations";
import type { EbmStaffel } from "./ausbildungsregeln/model";
import { DEFAULT_THERAPY_SESSION_MINUTES, FORECAST_LOOKBACK_WEEKS } from "./constants";
import { addDaysIso, daysBetweenIso } from "./dates";
import { presetPeriod } from "./nachweis-periods";

// Quartalsprognose fürs Dashboard (#6): „Wie viel Geld bekomme ich am Quartalsende?“ Rein und ohne Datenbank.
// `today` ist der Kalendertag in Europe/Berlin (todayIso); alle Kalenderrechnungen laufen auf YYYY-MM-DD.
// Gerechnet wird mit ungerundeten Faktoren (#51); gerundet werden nur Geldbeträge (Cent) – und die Anzeige, in
// forecastDisplay. Aus den gerundeten Faktoren der Karte gerechnet, wäre der Rest am vorletzten Quartalstag ein
// Drittel zu niedrig (1 Tag = 0,1 statt 0,143 Wochen).

export interface QuarterForecastInput {
  therapySessions: TherapySession[];
  supervisionSessions: SupervisionSession[];
  groupSessions: GroupSession[];
  settings: FinancialSettings;
  ebmStaffeln: EbmStaffel[]; // EBM-Staffeln aus dem Regelwerk (Gruppen-Honorar nach Datum)
  today: string;
}

export interface QuarterForecast {
  quarter: string; // „2026 Q3“ – wie in Finanzen
  period: { from: string; to: string };
  today: string;
  // Bisher im Quartal: dieselben Zahlen wie die Quartalsübersicht in Finanzen (Therapiehonorar plus Gruppen-Honorar,
  // Supervisionskosten, Ergebnis) und die Anzahl der Therapiesitzungen im Quartal.
  soFar: { income: number; costs: number; profit: number; sessions: number };
  // Rückblick: Therapiesitzungen der letzten FORECAST_LOOKBACK_WEEKS Wochen bis heute; sessionsPerWeek (11 Sitzungen =
  // 1,375) und incomePerSession (Einheiten je Sitzung × Honorarsatz) ungerundet.
  lookback: { weeks: number; sessions: number; sessionsPerWeek: number; incomePerSession: number };
  // Geplante Sitzungen pro Woche: Einstellung aus Finanzen, sonst der Schnitt aus dem Rückblick.
  planned: { sessionsPerWeek: number; source: "einstellung" | "schnitt" };
  // Rest des Quartals: Tage bis zum letzten Tag (heute = 0 am letzten Tag), Wochen = Tage ÷ 7, `plannedSessions` =
  // Planung × Wochen, `alreadyEntered` = schon eingetragene Therapiesitzungen nach heute bis Quartalsende (sie stecken
  // in „bisher“ und werden abgezogen, damit nichts doppelt zählt), `sessions` = Rest, nie negativ, `income` = Rest ×
  // Honorar je Sitzung auf Cent.
  remaining: { days: number; weeks: number; plannedSessions: number; sessions: number; alreadyEntered: number; income: number };
  // Prognose zum Quartalsende = Ergebnis bisher + Rest-Honorar, auf Cent. Künftige Supervisionskosten und Doppelstunden
  // werden nicht geschätzt – die Karte sagt das im Annahmetext.
  forecastProfit: number;
}

const cents = (value: number) => Math.round(value * 100) / 100;
const tenths = (value: number) => Math.round(value * 10) / 10;
const euro = (value: number) => Math.round(value);

export function quarterForecast(input: QuarterForecastInput): QuarterForecast {
  const { today, settings } = input;
  const period = presetPeriod("quartal", parseISO(today), null);
  const quarter = quarterOf(today);
  const inQuarter = (date: string) => date >= period.from && date <= period.to;

  const row = calculateQuarterlyFinancesWithGroups(
    input.therapySessions,
    input.supervisionSessions,
    input.groupSessions,
    settings.incomePerHour,
    settings.supervisionCosts,
    input.ebmStaffeln
  ).find((q) => q.quarter === quarter);
  const soFar = {
    income: row?.income ?? 0,
    costs: row?.costs ?? 0,
    profit: row?.profit ?? 0,
    sessions: input.therapySessions.filter((s) => inQuarter(s.date)).length,
  };

  const lookbackFrom = addDaysIso(today, -(FORECAST_LOOKBACK_WEEKS * 7 - 1));
  const lookbackSessions = input.therapySessions.filter((s) => s.date >= lookbackFrom && s.date <= today);
  const lookbackMinutes = lookbackSessions.reduce((sum, s) => sum + s.durationMinutes, 0);
  const minutesPerSession =
    lookbackSessions.length > 0 ? lookbackMinutes / lookbackSessions.length : DEFAULT_THERAPY_SESSION_MINUTES;
  const lookback = {
    weeks: FORECAST_LOOKBACK_WEEKS,
    sessions: lookbackSessions.length,
    sessionsPerWeek: lookbackSessions.length / FORECAST_LOOKBACK_WEEKS,
    incomePerSession: minutesToUnits(minutesPerSession) * settings.incomePerHour,
  };

  const planned =
    settings.plannedSessionsPerWeek === null
      ? { sessionsPerWeek: lookback.sessionsPerWeek, source: "schnitt" as const }
      : { sessionsPerWeek: settings.plannedSessionsPerWeek, source: "einstellung" as const };

  const days = Math.max(0, daysBetweenIso(today, period.to));
  const alreadyEntered = input.therapySessions.filter((s) => s.date > today && s.date <= period.to).length;
  const weeks = days / 7;
  const plannedSessions = planned.sessionsPerWeek * weeks;
  const sessions = Math.max(0, plannedSessions - alreadyEntered);
  const income = cents(sessions * lookback.incomePerSession);
  const remaining = { days, weeks, plannedSessions, sessions, alreadyEntered, income };

  return { quarter, period, today, soFar, lookback, planned, remaining, forecastProfit: cents(soFar.profit + income) };
}

export type EquationSign = "=" | "≈";

// Anzeigewerte der Karte: Faktoren auf Zehntel, Honorar je Sitzung auf Cent, Beträge auf ganze Euro – und je sichtbarer
// Gleichung das Zeichen: „=“, wenn die gerundeten Faktoren auf das gerundete Ergebnis führen, sonst „≈“ (#51). Die
// Überschrift ist immer die exakte Prognose; die Karte verbiegt sie nicht mehr, damit „bisher + Rest“ aufgeht.
export interface ForecastDisplay {
  perWeek: number; // Sitzungen pro Woche, Zehntel
  weeks: number; // verbleibende Wochen, Zehntel
  plannedSessions: number; // geplante Rest-Sitzungen vor Abzug, Zehntel
  sessions: number; // Rest-Sitzungen nach Abzug, Zehntel
  incomePerSession: number; // EUR je Sitzung, Cent
  income: number; // Rest-Honorar, ganze Euro
  soFarProfit: number; // Ergebnis bisher, ganze Euro
  forecastProfit: number; // Prognose (Überschrift), ganze Euro
  sessionsSign: EquationSign; // perWeek × weeks → plannedSessions
  incomeSign: EquationSign; // sessions × incomePerSession → income
  totalSign: EquationSign; // soFarProfit + income → forecastProfit
}

// Gleichungszeichen ganzzahlig statt als Float (#53): 1,5 × 1,9 ist exakt 2,85 – als Float 2,8499…, und das rundete
// fälschlich „=“ zu 2,8. `value` liegt in 1/ratio-Einheiten (Hundertstel → Zehntel: ratio 10; Tausendstel Euro → Euro:
// 1000); null bei exaktem Tie (…,5): dann steht „≈“, egal wohin die Anzeige gerundet hat.
function roundsTo(value: number, ratio: number): number | null {
  const rest = ((value % ratio) + ratio) % ratio;
  return rest * 2 === ratio ? null : Math.round(value / ratio);
}
const scaled = (value: number, scale: number) => Math.round(value * scale);

export function forecastDisplay(f: QuarterForecast): ForecastDisplay {
  const perWeek = tenths(f.planned.sessionsPerWeek);
  const weeks = tenths(f.remaining.weeks);
  const plannedSessions = tenths(f.remaining.plannedSessions);
  const sessions = tenths(f.remaining.sessions);
  const incomePerSession = cents(f.lookback.incomePerSession);
  const income = euro(f.remaining.income);
  const soFarProfit = euro(f.soFar.profit);
  const forecastProfit = euro(f.forecastProfit);
  // Zehntel × Zehntel = Hundertstel; „=“ nur, wenn das Produkt eindeutig auf die gezeigten Zehntel rundet. Ein exakter
  // Rest über 0, der angezeigt 0,0 wäre, ist nie „=“ – die Karte schreibt dann „weniger als 0,1 Sitzungen“.
  const plannedHundredths = scaled(perWeek, 10) * scaled(weeks, 10);
  const sessionsSign: EquationSign =
    f.remaining.plannedSessions > 0 && plannedSessions === 0
      ? "≈"
      : roundsTo(plannedHundredths, 10) === scaled(plannedSessions, 10)
        ? "="
        : "≈";
  // Zehntel × Cent = Tausendstel Euro. „=“ nur, wenn dieses exakte Produkt der gezeigten Faktoren eindeutig auf den
  // gezeigten Euro-Betrag rundet – in einem Schritt (#57). Zweistufig (erst Cent, dann Euro) meldete ein Cent-Tie wie
  // 1,1 × 45,45 = 49,995 „≈“, obwohl 50 eindeutig ist; ein echter Euro-Tie (0,1 × 85,00 = 8,500) bleibt „≈“.
  const incomeEuro = roundsTo(scaled(sessions, 10) * scaled(incomePerSession, 100), 1000);
  const incomeSign: EquationSign = f.remaining.sessions > 0 && sessions === 0 ? "≈" : incomeEuro === income ? "=" : "≈";
  return {
    perWeek,
    weeks,
    plannedSessions,
    sessions,
    incomePerSession,
    income,
    soFarProfit,
    forecastProfit,
    sessionsSign,
    incomeSign,
    totalSign: soFarProfit + income === forecastProfit ? "=" : "≈",
  };
}
