import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../lib/analytics/track", () => ({ track: vi.fn() }));

import { QuarterForecastCard } from "../dashboard/QuarterForecastCard";
import { quarterForecast, type QuarterForecast } from "../../lib/quarter-forecast";
import { newPatientId, newTherapySessionId, type TherapySession } from "@/types";
import { standardRegelwerk } from "../../lib/ausbildungsregeln/resolve";

const forecast: QuarterForecast = {
  quarter: "2026 Q3",
  period: { from: "2026-07-01", to: "2026-09-30" },
  today: "2026-09-27",
  soFar: { income: 920.83, costs: 90, profit: 830.83, sessions: 13 },
  // 11 Sitzungen in 8 Wochen = 1,375 pro Woche; 3 Tage = 3/7 Wochen; 1,375 × 3/7 = 0,589 Sitzungen × 85 EUR = 50,09 EUR
  lookback: { weeks: 8, sessions: 11, sessionsPerWeek: 1.375, incomePerSession: 85 },
  planned: { sessionsPerWeek: 1.375, source: "schnitt" },
  remaining: { days: 3, weeks: 3 / 7, plannedSessions: 1.375 * (3 / 7), sessions: 1.375 * (3 / 7), alreadyEntered: 0, income: 50.09 },
  forecastProfit: 880.92,
};
const APPROX_HINT = "„≈“ bedeutet: Die Faktoren sind zur Anzeige gerundet, gerechnet wird mit den ungerundeten Werten.";

describe("QuarterForecastCard", () => {
  it("zeigt Prognose, bisher, Einnahmen minus Supervision und legt die Rechnung offen", () => {
    render(<QuarterForecastCard forecast={forecast} incomePerHour={85} />);
    const region = screen.getByRole("region", { name: "Honorar 2026 Q3" });
    expect(region.textContent).toContain("Prognose zum Quartalsende (30.09.2026)");
    expect(screen.getByText("881 EUR")).toBeDefined();
    expect(region.textContent).toContain("Bisher 831 EUR aus 13 Sitzungen");
    expect(region.textContent).toContain("Einnahmen 921 EUR − Supervision 90 EUR");
    // 1,4 × 0,4 = 0,56 → 0,6 geht auf; 0,6 × 85 = 51 ≠ 50 (exakt 50,09) → ≈
    expect(region.textContent).toContain("Schnitt der letzten 8 Wochen: 1,4 Sitzungen pro Woche × 0,4 verbleibende Wochen = 0,6 Sitzungen × 85,00 EUR je Sitzung ≈ 50 EUR");
    expect(region.textContent).toContain("Ergebnis bisher 831 EUR + 50 EUR = 881 EUR");
    expect(region.textContent).toContain(APPROX_HINT);
    expect(region.textContent).toContain("Künftige Supervisionskosten und Doppelstunden sind nicht eingerechnet");
    expect(region.textContent).toContain("Behandlungsstunden (à 50 Min) × Honorarsatz");
    expect(region.textContent).not.toContain("abzüglich");
    expect(screen.getByRole("link", { name: "Geplante Sitzungen pro Woche in Finanzen anpassen" }).getAttribute("href")).toBe("/finances");
  });

  it("erklärt „≈“ nur, wenn es vorkommt", () => {
    render(
      <QuarterForecastCard
        forecast={{ ...forecast, today: "2026-09-30", remaining: { days: 0, weeks: 0, plannedSessions: 0, sessions: 0, alreadyEntered: 0, income: 0 }, forecastProfit: 830.83 }}
        incomePerHour={85}
      />
    );
    const text = screen.getByRole("region", { name: "Honorar 2026 Q3" }).textContent ?? "";
    expect(text).toContain("× 0,0 verbleibende Wochen = 0 Sitzungen × 85,00 EUR je Sitzung = 0 EUR");
    expect(text).not.toContain("≈");
    expect(text).not.toContain(APPROX_HINT);
  });

  it("benennt eine Planung aus den Einstellungen als solche", () => {
    render(
      <QuarterForecastCard
        forecast={{ ...forecast, planned: { sessionsPerWeek: 7, source: "einstellung" }, remaining: { days: 3, weeks: 3 / 7, plannedSessions: 3, sessions: 3, alreadyEntered: 0, income: 255 }, forecastProfit: 1085.83 }}
        incomePerHour={85}
      />
    );
    expect(screen.getByRole("region", { name: "Honorar 2026 Q3" }).textContent).toContain("Geplant: 7,0 Sitzungen pro Woche × 0,4 verbleibende Wochen ≈ 3 Sitzungen × 85,00 EUR je Sitzung = 255 EUR");
    expect(screen.getByText("1.086 EUR")).toBeDefined();
  });

  it("zieht bereits eingetragene künftige Sitzungen sichtbar ab, damit die Rechnung aufgeht", () => {
    // 5 pro Woche × 4/7 Wochen = 2,857 Sitzungen, 2 schon eingetragen → 0,857 Rest × 85 = 72,86
    render(
      <QuarterForecastCard
        forecast={{ ...forecast, planned: { sessionsPerWeek: 5, source: "einstellung" }, remaining: { days: 4, weeks: 4 / 7, plannedSessions: 5 * (4 / 7), sessions: 5 * (4 / 7) - 2, alreadyEntered: 2, income: 72.86 }, forecastProfit: 903.69 }}
        incomePerHour={85}
      />
    );
    expect(screen.getByRole("region", { name: "Honorar 2026 Q3" }).textContent).toContain(
      "Geplant: 5,0 Sitzungen pro Woche × 0,6 verbleibende Wochen ≈ 2,9 Sitzungen, abzüglich 2 bereits eingetragener = 0,9 Sitzungen × 85,00 EUR je Sitzung ≈ 73 EUR"
    );
  });

  it("sagt ehrlich, wenn alle geplanten Rest-Sitzungen schon eingetragen sind", () => {
    // 1,4 pro Woche × 0,4 Wochen = 0,6 Sitzungen geplant, aber 2 schon eingetragen → kein Rest, keine negative Rechnung.
    render(
      <QuarterForecastCard
        forecast={{ ...forecast, remaining: { days: 3, weeks: 3 / 7, plannedSessions: 1.375 * (3 / 7), sessions: 0, alreadyEntered: 2, income: 0 }, forecastProfit: 830.83 }}
        incomePerHour={85}
      />
    );
    const text = screen.getByRole("region", { name: "Honorar 2026 Q3" }).textContent;
    expect(text).toContain("= 0,6 Sitzungen; 2 sind bereits eingetragen, es bleiben 0 Sitzungen × 85,00 EUR je Sitzung = 0 EUR");
    expect(text).toContain("Ergebnis bisher 831 EUR + 0 EUR = 831 EUR");
  });

  it("zeigt die exakte Prognose in der Überschrift und markiert eine Summe, die gerundet nicht aufgeht, mit ≈", () => {
    // 100,50 + 50,50 = 151,00 – ganzzahlig gerundet angezeigt 101 + 51 ≈ 151; die Überschrift bleibt 151.
    render(
      <QuarterForecastCard
        forecast={{
          ...forecast,
          soFar: { income: 190.5, costs: 90, profit: 100.5, sessions: 3 },
          planned: { sessionsPerWeek: 7, source: "einstellung" },
          remaining: { days: 3, weeks: 3 / 7, plannedSessions: 3, sessions: 3, alreadyEntered: 0, income: 50.5 },
          lookback: { ...forecast.lookback, incomePerSession: 50.5 / 3 },
          forecastProfit: 151,
        }}
        incomePerHour={85}
      />
    );
    const text = screen.getByRole("region", { name: "Honorar 2026 Q3" }).textContent;
    expect(text).toContain("Ergebnis bisher 101 EUR + 51 EUR ≈ 151 EUR");
    expect(screen.getByText("151 EUR")).toBeDefined();
    expect(text).not.toContain("152 EUR");
  });

  it("zeigt Rest-Sitzungen in Zehnteln, und die Rechnung geht weiter auf", () => {
    // Montag der letzten Quartalswoche: 6 pro Woche × 2/7 Wochen = 1,714 Sitzungen × 85 EUR = 145,71 EUR
    render(
      <QuarterForecastCard
        forecast={{ ...forecast, planned: { sessionsPerWeek: 6, source: "einstellung" }, remaining: { days: 2, weeks: 2 / 7, plannedSessions: 12 / 7, sessions: 12 / 7, alreadyEntered: 0, income: 145.71 }, forecastProfit: 976.54 }}
        incomePerHour={85}
      />
    );
    const text = screen.getByRole("region", { name: "Honorar 2026 Q3" }).textContent;
    expect(text).toContain("Geplant: 6,0 Sitzungen pro Woche × 0,3 verbleibende Wochen ≈ 1,7 Sitzungen × 85,00 EUR je Sitzung ≈ 146 EUR");
    expect(text).toContain("Ergebnis bisher 831 EUR + 146 EUR = 977 EUR");
    expect(screen.getByText("977 EUR")).toBeDefined();
  });

  it("zieht eingetragene Sitzungen auch von einem Zehntel-Rest ab", () => {
    render(
      <QuarterForecastCard
        forecast={{ ...forecast, planned: { sessionsPerWeek: 6, source: "einstellung" }, remaining: { days: 2, weeks: 2 / 7, plannedSessions: 12 / 7, sessions: 12 / 7 - 1, alreadyEntered: 1, income: 60.71 } }}
        incomePerHour={85}
      />
    );
    expect(screen.getByRole("region", { name: "Honorar 2026 Q3" }).textContent).toContain(
      "≈ 1,7 Sitzungen, abzüglich 1 bereits eingetragener = 0,7 Sitzungen × 85,00 EUR je Sitzung ≈ 61 EUR"
    );
  });

  it("Eigenschaft: „=“ genau dann, wenn die angezeigten Faktoren eindeutig auf das angezeigte Ergebnis runden – gerechnet in ganzen Zehnteln und Cent, nie in Gleitkommazahlen", () => {
    let n = 0;
    const session = (date: string): TherapySession => ({
      id: newTherapySessionId(`t-${++n}`),
      patientId: newPatientId("p-1"),
      date,
      durationMinutes: 50,
      notes: "",
      category: "behandlung",
    });
    const lookback = ["2026-08-10", "2026-08-20", "2026-09-01", "2026-09-10", "2026-09-20"].map(session);
    const cases: Array<{ today: string; planned: number | null; entered?: string[]; incomePerHour?: number }> = [
      { today: "2026-08-16", planned: 5 },
      { today: "2026-08-16", planned: 5, entered: ["2026-08-17", "2026-09-01", "2026-09-30"] },
      { today: "2026-08-16", planned: 2.25 },
      { today: "2026-09-27", planned: 7 },
      { today: "2026-09-28", planned: 6 },
      { today: "2026-09-29", planned: 6 },
      { today: "2026-09-29", planned: 6, entered: ["2026-09-30"] },
      { today: "2026-09-27", planned: null },
      { today: "2026-07-05", planned: 3.3 },
      // 13 Tage = 1,857 → 1,9 Wochen; 1,5 × 1,9 = 2,85 exakt – ein Tie, der als Float 2,8499… wäre
      { today: "2026-09-17", planned: 1.5 },
      // Honorar ab 1.000 EUR je Sitzung: „1.234,56 EUR je Sitzung“ mit Tausenderpunkt, ebenso die Beträge
      { today: "2026-08-16", planned: 5, incomePerHour: 1234.56 },
      // „weniger als 0,1 Sitzungen“: 1 Tag Rest × 0,25 pro Woche = 0,036
      { today: "2026-09-29", planned: 0.25 },
      // Gleichstand: 0,1 Sitzungen × 85,00 EUR = 8,500 EUR liegt genau auf der Euro-Grenze → „≈“
      { today: "2026-09-29", planned: 0.5 },
      // Vollverbrauch: der geplante Rest ist schon eingetragen – „es bleiben 0 Sitzungen … = 0 EUR“
      { today: "2026-09-28", planned: 1, entered: ["2026-09-30"] },
    ];
    // Angezeigte Zahl → ganze Zahl in der feinsten angezeigten Einheit, mit deutschem Tausenderpunkt:
    // „1,4“ → 14 Zehntel, „1.234,56“ → 123456 Cent, „1.086“ → 1086 Euro.
    const number = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
    const tenths = (s: string) => Math.round(number(s) * 10);
    const cents = (s: string) => Math.round(number(s) * 100);
    const euros = (s: string) => number(s);
    // Rundet `value` (in 1/ratio-Einheiten) auf ganze Einheiten; null bei exaktem Tie – dann darf nur „≈“ stehen.
    const roundsTo = (value: number, ratio: number): number | null => ((value % ratio) * 2 === ratio ? null : Math.round(value / ratio));
    const seen = { weniger: false, gleichstand: false, tausender: false, vollverbrauch: false };
    for (const c of cases) {
      const label = `${c.today} / ${c.planned}`;
      const f = quarterForecast({
        therapySessions: [...lookback, ...(c.entered ?? []).map(session)],
        supervisionSessions: [],
        groupSessions: [],
        settings: { incomePerHour: c.incomePerHour ?? 85, supervisionCosts: {}, plannedSessionsPerWeek: c.planned },
        today: c.today,
        ebmStaffeln: standardRegelwerk().ebmStaffeln,
      });
      const { unmount } = render(<QuarterForecastCard forecast={f} incomePerHour={c.incomePerHour ?? 85} />);
      const text = screen.getByRole("region", { name: /^Honorar / }).textContent ?? "";
      const chain = text.match(/([\d.,]+) Sitzungen pro Woche × ([\d.,]+) verbleibende Wochen (=|≈) (weniger als )?([\d.,]+) Sitzung/);
      expect(chain, label).not.toBeNull();
      const [, perWeek, weeks, sessionsSign, lessThanPlanned, planned] = chain!;
      const plannedHundredths = tenths(perWeek) * tenths(weeks);
      expect(sessionsSign, `${label}: ${chain![0]}`).toBe(lessThanPlanned || roundsTo(plannedHundredths, 10) !== tenths(planned) ? "≈" : "=");
      const rest = text.match(/(weniger als )?([\d.,]+) Sitzungen? × ([\d.,]+) EUR je Sitzung (=|≈) ([\d.]+) EUR/);
      expect(rest, label).not.toBeNull();
      const [, lessThanRest, sessions, perSession, incomeSign, euro] = rest!;
      // Zehntel × Cent = Tausendstel Euro; „=“ nur, wenn dieses exakte Produkt eindeutig auf den gezeigten Betrag rundet.
      const milli = tenths(sessions) * cents(perSession);
      const shownEuro = roundsTo(milli, 1000);
      seen.weniger ||= Boolean(lessThanPlanned || lessThanRest);
      seen.gleichstand ||= shownEuro === null;
      // „je Sitzung“ steht wie die Euro-Beträge mit Tausenderpunkt („1.234,56“, „34.744“) – der Parser liest beides.
      seen.tausender ||= perSession === "1.234,56";
      seen.vollverbrauch ||= text.includes("es bleiben 0 Sitzungen");
      expect(incomeSign, `${label}: ${rest![0]}`).toBe(lessThanRest || shownEuro !== euros(euro) ? "≈" : "=");
      const total = text.match(/Ergebnis bisher ([\d.]+) EUR \+ ([\d.]+) EUR (=|≈) ([\d.]+) EUR/);
      expect(total, label).not.toBeNull();
      const [, soFar, income, totalSign, shown] = total!;
      expect(totalSign, `${label}: ${total![0]}`).toBe(euros(soFar) + euros(income) === euros(shown) ? "=" : "≈");
      // Überschrift = exakte Prognose = bisher + Rest auf Cent
      expect(euros(shown), label).toBe(Math.round(f.forecastProfit));
      expect(f.forecastProfit, label).toBe(Math.round((f.soFar.profit + f.remaining.income) * 100) / 100);
      expect(text.includes(APPROX_HINT), label).toBe(text.includes("≈"));
      unmount();
    }
    expect(seen).toEqual({ weniger: true, gleichstand: true, tausender: true, vollverbrauch: true });
  });

  it("schreibt einen Rest knapp über 0 als „weniger als 0,1 Sitzungen“ mit „≈“ statt „0 Sitzungen ≈ 3 EUR“", () => {
    render(
      <QuarterForecastCard
        forecast={{ ...forecast, remaining: { days: 1, weeks: 1 / 7, plannedSessions: 0.04, sessions: 0.04, alreadyEntered: 0, income: 3.4 }, forecastProfit: 834.23 }}
        incomePerHour={85}
      />
    );
    const text = screen.getByRole("region", { name: "Honorar 2026 Q3" }).textContent ?? "";
    expect(text).toContain("× 0,1 verbleibende Wochen ≈ weniger als 0,1 Sitzungen × 85,00 EUR je Sitzung ≈ 3 EUR");
    expect(text).not.toContain("0 Sitzungen ×");
  });

  it("ohne Honorarsatz zählt sie nur Sitzungen und verweist auf Finanzen", () => {
    render(<QuarterForecastCard forecast={{ ...forecast, soFar: { income: 0, costs: 0, profit: 0, sessions: 13 }, forecastProfit: 0 }} incomePerHour={0} />);
    const region = screen.getByRole("region", { name: "Honorar 2026 Q3" });
    expect(region.textContent).toContain("13 Sitzungen im Quartal");
    expect(region.textContent).not.toContain("EUR");
    expect(screen.getByRole("link", { name: "in Finanzen eintragen" }).getAttribute("href")).toBe("/finances");
  });

  it("rundet das Rest-Honorar in einem Schritt: 1,1 × 45,45 = 49,995 → „= 50 EUR“, nicht „≈“", () => {
    render(
      <QuarterForecastCard
        forecast={{
          ...forecast,
          lookback: { ...forecast.lookback, incomePerSession: 45.45 },
          planned: { sessionsPerWeek: 1.1, source: "einstellung" },
          remaining: { days: 7, weeks: 1, plannedSessions: 1.1, sessions: 1.1, alreadyEntered: 0, income: 50 },
          forecastProfit: 880.83,
        }}
        incomePerHour={45.45}
      />
    );
    expect(screen.getByRole("region", { name: "Honorar 2026 Q3" }).textContent).toContain(
      "Geplant: 1,1 Sitzungen pro Woche × 1,0 verbleibende Wochen = 1,1 Sitzungen × 45,45 EUR je Sitzung = 50 EUR"
    );
  });
});
