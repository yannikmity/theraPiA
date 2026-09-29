// @vitest-environment node
// Westlich von UTC: new Date("YYYY-MM-DD") wäre UTC-Mitternacht und fiele auf den Vortag. Die Prognose rechnet
// deshalb wie calculations.ts mit parseISO (lokale Mitternacht) auf Kalendertagen.
// TZ setzt das Vitest-Projekt „westlich-von-utc“ (vitest.config.ts).

import { it, expect } from "vitest";
import { quarterForecast } from "../quarter-forecast";
import { addDaysIso, daysBetweenIso } from "../dates";
import { standardRegelwerk } from "../ausbildungsregeln/resolve";
import type { TherapySession } from "@/types";

it("ordnet den 1. Oktober auch westlich von UTC dem 4. Quartal zu und zählt Kalendertage", () => {
  expect(new Date(2026, 9, 1).getTimezoneOffset()).toBeGreaterThan(0);
  const session = { date: "2026-10-01", durationMinutes: 60 } as TherapySession;
  const f = quarterForecast({
    therapySessions: [session],
    supervisionSessions: [],
    groupSessions: [],
    settings: { incomePerHour: 100, supervisionCosts: {}, plannedSessionsPerWeek: null },
    today: "2026-10-01",
    ebmStaffeln: standardRegelwerk().ebmStaffeln,
  });
  expect(f.quarter).toBe("2026 Q4");
  expect(f.period).toEqual({ from: "2026-10-01", to: "2026-12-31" });
  // 60 Min = 1,2 Behandlungsstunden × 100 EUR
  expect(f.soFar).toMatchObject({ income: 120, sessions: 1 });
  expect(f.remaining.days).toBe(91);
  expect(addDaysIso("2026-10-01", -1)).toBe("2026-09-30");
  expect(daysBetweenIso("2026-10-01", "2026-12-31")).toBe(91);
});
