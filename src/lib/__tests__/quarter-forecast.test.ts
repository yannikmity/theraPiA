// @vitest-environment node
import { describe, it, expect } from "vitest";
import { forecastDisplay, quarterForecast, type QuarterForecast, type QuarterForecastInput } from "../quarter-forecast";
import { calculateQuarterlyFinancesWithGroups } from "../calculations";
import { resolveRegelwerk, standardRegelwerk } from "../ausbildungsregeln/resolve";
import {
  newGroupId,
  newGroupSessionId,
  newPatientId,
  newSupervisionSessionId,
  newSupervisorId,
  newTherapySessionId,
  type FinancialSettings,
  type GroupSession,
  type SupervisionSession,
  type TherapySession,
} from "@/types";

const SUP = newSupervisorId("s-1");
const settings = (overrides: Partial<FinancialSettings> = {}): FinancialSettings => ({
  incomePerHour: 85,
  supervisionCosts: { [SUP]: 90 },
  plannedSessionsPerWeek: null,
  ...overrides,
});

let n = 0;
const session = (date: string, durationMinutes = 50): TherapySession => ({
  id: newTherapySessionId(`t-${++n}`),
  patientId: newPatientId("p-1"),
  date,
  durationMinutes,
  notes: "",
  category: "behandlung",
});
const supervision = (date: string, durationMinutes = 60): SupervisionSession => ({
  id: newSupervisionSessionId(`sv-${++n}`),
  supervisorId: SUP,
  date,
  durationMinutes,
  kind: "individual",
  setting: "einzel",
  linkedTherapySessionIds: [],
  linkedGroupSessionIds: [],
  caseShares: [],
});
const groupSession = (date: string, childCount = 6): GroupSession => ({
  id: newGroupSessionId(`gs-${++n}`),
  groupId: newGroupId("g-1"),
  date,
  status: "durchgefuehrt",
  childCount,
  countsTowardAmbulanzzeit: true,
  durationMinutes: 100,
  notes: "",
});
const input = (overrides: Partial<QuarterForecastInput> = {}): QuarterForecastInput => ({
  therapySessions: [],
  supervisionSessions: [],
  groupSessions: [],
  settings: settings(),
  today: "2026-09-27",
  ebmStaffeln: standardRegelwerk().ebmStaffeln,
  ...overrides,
});
// Faktoren sind ungerundet (#51): Brüche auf sechs Stellen vergleichen, Tage, Abzug und Cent-Beträge exakt.
function expectRemaining(f: QuarterForecast, e: QuarterForecast["remaining"]) {
  expect(f.remaining).toMatchObject({ days: e.days, alreadyEntered: e.alreadyEntered, income: e.income });
  expect(f.remaining.weeks).toBeCloseTo(e.weeks, 6);
  expect(f.remaining.plannedSessions).toBeCloseTo(e.plannedSessions, 6);
  expect(f.remaining.sessions).toBeCloseTo(e.sessions, 6);
}

describe("quarterForecast", () => {
  it("„bisher“ sind dieselben Zahlen wie die Quartalsübersicht in Finanzen – inklusive Gruppen-Honorar", () => {
    const therapySessions = [session("2026-06-30"), session("2026-07-01"), session("2026-09-30", 60), session("2026-10-01")];
    const supervisionSessions = [supervision("2026-08-10")];
    const groupSessions = [groupSession("2026-08-03", 6), groupSession("2026-05-04", 6)];
    const f = quarterForecast(input({ therapySessions, supervisionSessions, groupSessions }));
    const finanzen = calculateQuarterlyFinancesWithGroups(therapySessions, supervisionSessions, groupSessions, 85, { [SUP]: 90 }, standardRegelwerk().ebmStaffeln).find(
      (q) => q.quarter === "2026 Q3"
    );
    expect(f.quarter).toBe("2026 Q3");
    expect(f.period).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(f.today).toBe("2026-09-27");
    expect(finanzen).toBeDefined();
    expect(f.soFar).toEqual({ income: finanzen!.income, costs: finanzen!.costs, profit: finanzen!.profit, sessions: 2 });
    // 110 Min = 2,2 Behandlungsstunden × 85 EUR = 187,00 + EBM-Anteil 121,50 (6 Kinder) = 308,50; Supervision 60 Min = 1,2 Einheiten × 90 EUR = 108
    expect(f.soFar).toMatchObject({ income: 308.5, costs: 108, profit: 200.5 });
  });

  it("Schnitt: Sitzungen der letzten 8 Wochen bis heute, Grenzen inklusive, Zukunft und Älteres nicht", () => {
    const therapySessions = [session("2026-08-02"), session("2026-08-03"), session("2026-09-15", 60), session("2026-09-27"), session("2026-09-28")];
    const f = quarterForecast(input({ therapySessions }));
    // 03.08. (vor 55 Tagen) bis 27.09.: 3 Sitzungen ÷ 8 = 0,375 pro Woche; 160 Min ÷ 3 = 53,33 Min = 1,067 Behandlungsstunden × 85 EUR = 90,67 EUR
    expect(f.lookback).toMatchObject({ weeks: 8, sessions: 3, sessionsPerWeek: 0.375 });
    expect(f.lookback.incomePerSession).toBeCloseTo(90.666667, 5);
  });

  it("Prognose = Ergebnis bisher + geplante Sitzungen × Honorar je Sitzung", () => {
    const therapySessions = [session("2026-09-01"), session("2026-09-08")];
    const f = quarterForecast(input({ therapySessions, settings: settings({ plannedSessionsPerWeek: 7 }) }));
    expect(f.planned).toEqual({ sessionsPerWeek: 7, source: "einstellung" });
    // 27.09. → 30.09.: 3 Tage = 3/7 Wochen; 7 × 3/7 = 3 Sitzungen × 85 EUR (50 Min = 1 Behandlungsstunde × 85 EUR) = 255
    expectRemaining(f, { days: 3, weeks: 3 / 7, plannedSessions: 3, sessions: 3, alreadyEntered: 0, income: 255 });
    // bisher 100 Min = 2 Behandlungsstunden × 85 EUR = 170
    expect(f.soFar.profit).toBe(170);
    expect(f.forecastProfit).toBe(425);
  });

  it("ohne Einstellung gilt der Schnitt; ohne Sitzungen im Rückblick zählt eine Sitzung 50 Minuten × Stundensatz", () => {
    const f = quarterForecast(input({ therapySessions: [session("2026-07-01")] }));
    expect(f.planned).toEqual({ sessionsPerWeek: 0, source: "schnitt" });
    expect(f.lookback).toEqual({ weeks: 8, sessions: 0, sessionsPerWeek: 0, incomePerSession: 85 });
    expectRemaining(f, { days: 3, weeks: 3 / 7, plannedSessions: 0, sessions: 0, alreadyEntered: 0, income: 0 });
    expect(f.forecastProfit).toBe(f.soFar.profit);
    // Mitten im Quartal mit Planung: 16.08. → 30.09. sind 45 Tage = 45/7 Wochen, 5 × 45/7 = 32,14 Sitzungen × 85 EUR = 2732,14
    const mid = quarterForecast(input({ today: "2026-08-16", settings: settings({ plannedSessionsPerWeek: 5 }) }));
    expectRemaining(mid, { days: 45, weeks: 45 / 7, plannedSessions: 32.142857, sessions: 32.142857, alreadyEntered: 0, income: 2732.14 });
  });

  it("Quartalsgrenzen: letzter Tag ohne Resttage, erster Tag des nächsten Quartals ohne „bisher“", () => {
    const therapySessions = [session("2026-09-30")];
    const last = quarterForecast(input({ therapySessions, today: "2026-09-30" }));
    expect(last.quarter).toBe("2026 Q3");
    expect(last.remaining.days).toBe(0);
    expect(last.soFar.sessions).toBe(1);
    const next = quarterForecast(input({ therapySessions, today: "2026-10-01" }));
    expect(next.quarter).toBe("2026 Q4");
    expect(next.period).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(next.soFar).toEqual({ income: 0, costs: 0, profit: 0, sessions: 0 });
    expect(next.remaining.days).toBe(91);
    expect(quarterForecast(input({ today: "2026-12-31" })).remaining.days).toBe(0);
    expect(quarterForecast(input({ today: "2027-01-01" })).quarter).toBe("2027 Q1");
  });

  it("ohne Stundensatz sind alle Beträge 0, Sitzungen werden trotzdem gezählt", () => {
    const f = quarterForecast(input({ therapySessions: [session("2026-09-20")], settings: settings({ incomePerHour: 0 }) }));
    expect(f.soFar).toEqual({ income: 0, costs: 0, profit: 0, sessions: 1 });
    expect(f.lookback.incomePerSession).toBe(0);
    expect(f.forecastProfit).toBe(0);
  });

  it("bereits eingetragene künftige Sitzungen im Quartal zählen nicht doppelt: sie stecken in „bisher“ und mindern den Rest", () => {
    // Heute 16.08., Planung 5/Woche → 5 × 45/7 = 32,14 Sitzungen bis 30.09.; drei schon eingetragen (17.08., 01.09., 30.09.), heute selbst zählt nicht
    const therapySessions = [session("2026-08-16"), session("2026-08-17"), session("2026-09-01"), session("2026-09-30")];
    const f = quarterForecast(input({ therapySessions, today: "2026-08-16", settings: settings({ plannedSessionsPerWeek: 5 }) }));
    expect(f.soFar.sessions).toBe(4);
    expectRemaining(f, { days: 45, weeks: 45 / 7, plannedSessions: 32.142857, sessions: 29.142857, alreadyEntered: 3, income: 2477.14 });
    // 29,14 × 85 = 2477,14; bisher 200 Min = 4 Behandlungsstunden × 85 EUR = 340 → Prognose 2817,14
    expect(f.soFar.profit).toBe(340);
    expect(f.forecastProfit).toBe(2817.14);
  });

  it("mehr eingetragen als geplant: Rest wird 0, nicht negativ", () => {
    const therapySessions = [session("2026-09-28"), session("2026-09-29"), session("2026-09-30")];
    const f = quarterForecast(input({ therapySessions, settings: settings({ plannedSessionsPerWeek: 2 }) }));
    // 2 × 3/7 Wochen = 0,857 geplante Sitzungen, 3 schon eingetragen
    expectRemaining(f, { days: 3, weeks: 3 / 7, plannedSessions: 6 / 7, sessions: 0, alreadyEntered: 3, income: 0 });
    expect(f.forecastProfit).toBe(f.soFar.profit);
  });

  it("künftige Sitzungen nach Quartalsende zählen nicht als bereits eingetragen", () => {
    const therapySessions = [session("2026-10-01"), session("2026-12-01")];
    const f = quarterForecast(input({ therapySessions, settings: settings({ plannedSessionsPerWeek: 7 }) }));
    expectRemaining(f, { days: 3, weeks: 3 / 7, plannedSessions: 3, sessions: 3, alreadyEntered: 0, income: 255 });
    expect(f.soFar.sessions).toBe(0);
  });

  it("letzte Tage des Quartals: Prognose aus ungerundeten Faktoren, nicht aus den gerundeten Zahlen der Karte (#51)", () => {
    const plan = settings({ plannedSessionsPerWeek: 6 });
    const monday = quarterForecast(input({ today: "2026-09-28", settings: plan }));
    // 2 Tage = 2/7 Wochen; 6 × 2/7 = 1,714 Sitzungen × 85 EUR = 145,71 EUR (aus den gerundeten Faktoren 6 × 0,3 wären es 153)
    expectRemaining(monday, { days: 2, weeks: 2 / 7, plannedSessions: 12 / 7, sessions: 12 / 7, alreadyEntered: 0, income: 145.71 });
    expect(monday.forecastProfit).toBe(Math.round(6 * (2 / 7) * 85 * 100) / 100);
    const tuesday = quarterForecast(input({ today: "2026-09-29", settings: plan }));
    // 1 Tag = 1/7 Wochen; 6 × 1/7 = 0,857 Sitzungen × 85 EUR = 72,86 EUR (aus 6 × 0,1 wären es 51 – ein Drittel zu wenig)
    expectRemaining(tuesday, { days: 1, weeks: 1 / 7, plannedSessions: 6 / 7, sessions: 6 / 7, alreadyEntered: 0, income: 72.86 });
    expect(tuesday.forecastProfit).toBe(72.86);
    const wednesday = quarterForecast(input({ today: "2026-09-30", settings: plan }));
    expect(wednesday.remaining).toEqual({ days: 0, weeks: 0, plannedSessions: 0, sessions: 0, alreadyEntered: 0, income: 0 });
    // Eine schon eingetragene Sitzung am 29.09. mindert den Rest: 1,714 − 1 = 0,714 × 85 = 60,71; bisher 85 → 145,71 wie ohne Eintrag
    const entered = quarterForecast(input({ today: "2026-09-28", therapySessions: [session("2026-09-29")], settings: plan }));
    expectRemaining(entered, { days: 2, weeks: 2 / 7, plannedSessions: 12 / 7, sessions: 12 / 7 - 1, alreadyEntered: 1, income: 60.71 });
    expect(entered.forecastProfit).toBe(145.71);
  });

  it("rundet die Planung nicht: 2,25 pro Woche bleiben 2,25 in der Rechnung", () => {
    // 16.08.: 45/7 Wochen; 2,25 × 45/7 = 14,464 Sitzungen × 85 EUR = 1229,46 (die Karte zeigt 2,3 × 6,4 ≈ 14,5)
    const f = quarterForecast(input({ today: "2026-08-16", settings: settings({ plannedSessionsPerWeek: 2.25 }) }));
    expect(f.planned).toEqual({ sessionsPerWeek: 2.25, source: "einstellung" });
    expectRemaining(f, { days: 45, weeks: 45 / 7, plannedSessions: 14.464286, sessions: 14.464286, alreadyEntered: 0, income: 1229.46 });
  });
});

describe("forecastDisplay", () => {
  it("rundet die Faktoren zur Anzeige und markiert jede Gleichung, die gerundet nicht aufgeht, mit ≈", () => {
    const f = quarterForecast(input({ today: "2026-09-28", settings: settings({ plannedSessionsPerWeek: 6 }) }));
    // 6,0 × 0,3 = 1,8 ≠ 1,7 (exakt 1,714) → ≈; 1,7 × 85,00 = 144,50 → 145 ≠ 146 (exakt 145,71) → ≈; 0 + 146 = 146 → =
    expect(forecastDisplay(f)).toEqual({
      perWeek: 6, weeks: 0.3, plannedSessions: 1.7, sessions: 1.7, incomePerSession: 85,
      income: 146, soFarProfit: 0, forecastProfit: 146,
      sessionsSign: "≈", incomeSign: "≈", totalSign: "=",
    });
  });

  it("zeigt =, wenn die gerundete Rechnung aufgeht", () => {
    const f = quarterForecast(input({ today: "2026-09-30", settings: settings({ plannedSessionsPerWeek: 6 }) }));
    expect(forecastDisplay(f)).toMatchObject({ weeks: 0, plannedSessions: 0, income: 0, sessionsSign: "=", incomeSign: "=", totalSign: "=" });
    // 7 × 3/7 = 3 Sitzungen exakt: 7,0 × 0,4 = 2,8 ≠ 3 → ≈, aber 3 × 85,00 = 255 → =
    const g = quarterForecast(input({ today: "2026-09-27", settings: settings({ plannedSessionsPerWeek: 7 }) }));
    expect(forecastDisplay(g)).toMatchObject({ plannedSessions: 3, income: 255, sessionsSign: "≈", incomeSign: "=", totalSign: "=" });
  });

  it("markiert auch „bisher + Rest = Prognose“, wenn die gerundeten Summanden nicht auf die gerundete Prognose führen", () => {
    // 100,50 + 50,50 = 151,00; angezeigt 101 + 51 = 152 ≠ 151 → ≈, die Überschrift bleibt 151
    const f: QuarterForecast = {
      ...quarterForecast(input()),
      soFar: { income: 190.5, costs: 90, profit: 100.5, sessions: 3 },
      remaining: { days: 3, weeks: 3 / 7, plannedSessions: 3, sessions: 3, alreadyEntered: 0, income: 50.5 },
      forecastProfit: 151,
    };
    expect(forecastDisplay(f)).toMatchObject({ soFarProfit: 101, income: 51, forecastProfit: 151, totalSign: "≈" });
  });

  it("Gleichungszeichen ganzzahlig: 1,5 × 1,9 = 2,85 ist ein Tie und bekommt „≈“, 1,4 × 0,4 = 0,56 rundet eindeutig auf 0,6 (#53)", () => {
    const base = quarterForecast(input());
    const tie: QuarterForecast = {
      ...base,
      planned: { sessionsPerWeek: 1.5, source: "einstellung" },
      remaining: { days: 13, weeks: 1.9, plannedSessions: 2.85, sessions: 2.85, alreadyEntered: 0, income: 242.25 },
    };
    // Als Float ist 1,5 × 1,9 = 2,8499…; gerundet 2,8 „=“ wäre falsch: 2,85 rundet nicht eindeutig.
    expect(forecastDisplay(tie).sessionsSign).toBe("≈");
    expect(forecastDisplay({ ...tie, remaining: { ...tie.remaining, plannedSessions: 2.9, sessions: 2.9 } }).sessionsSign).toBe("≈");
    const clear: QuarterForecast = {
      ...base,
      planned: { sessionsPerWeek: 1.4, source: "schnitt" },
      remaining: { days: 3, weeks: 0.4, plannedSessions: 0.56, sessions: 0.56, alreadyEntered: 0, income: 47.6 },
    };
    expect(forecastDisplay(clear).sessionsSign).toBe("=");
    // Geld: 0,9 × 85,00 = 76,50 → Tie bei ganzen Euro → ≈; 3 × 85,00 = 255,00 → =
    expect(forecastDisplay({ ...base, remaining: { days: 1, weeks: 1 / 7, plannedSessions: 0.9, sessions: 0.9, alreadyEntered: 0, income: 76.5 } }).incomeSign).toBe("≈");
    expect(forecastDisplay({ ...base, remaining: { days: 3, weeks: 3 / 7, plannedSessions: 3, sessions: 3, alreadyEntered: 0, income: 255 } }).incomeSign).toBe("=");
  });

  it("ein Rest knapp über 0 bekommt „≈“ statt „0 Sitzungen = 3 EUR“ (#53)", () => {
    const f: QuarterForecast = {
      ...quarterForecast(input()),
      remaining: { days: 1, weeks: 1 / 7, plannedSessions: 0.04, sessions: 0.04, alreadyEntered: 0, income: 3.4 },
      forecastProfit: 3.4,
    };
    expect(forecastDisplay(f)).toMatchObject({ sessions: 0, plannedSessions: 0, income: 3, sessionsSign: "≈", incomeSign: "≈" });
  });
});

describe("quarterForecast mit EBM-Staffel nach Datum (#8)", () => {
  it("rechnet Doppelstunden im Quartal mit der Staffel an ihrem Datum", () => {
    const ebmStaffeln = resolveRegelwerk({
      instanz: null,
      abweichungen: null,
      ebmStaffeln: [
        { id: "alt", gueltigAb: "2000-01-01", stufen: [{ kinderzahl: 3, total: 100, share: 50 }] },
        { id: "neu", gueltigAb: "2026-08-01", stufen: [{ kinderzahl: 3, total: 110, share: 55 }] },
      ],
    }).ebmStaffeln;
    const f = quarterForecast(input({ groupSessions: [groupSession("2026-07-20", 3), groupSession("2026-08-10", 3)], ebmStaffeln }));
    expect(f.soFar.income).toBe(105);
  });
});
