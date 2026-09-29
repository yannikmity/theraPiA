// @vitest-environment node
// Zeitzone westlich von UTC: new Date("YYYY-MM-DD") ist UTC-Mitternacht und fiel dort auf den Vortag.
// TZ setzt das Vitest-Projekt „westlich-von-utc“ (vitest.config.ts).

import { it, expect } from "vitest";
import { calculateQuarterlyFinances } from "../calculations";
import type { TherapySession } from "@/types";

it("ordnet eine Sitzung vom 1. Oktober auch westlich von UTC Q4 zu", () => {
  expect(new Date(2026, 9, 1).getTimezoneOffset()).toBeGreaterThan(0);
  const session = { date: "2026-10-01", durationMinutes: 60 } as TherapySession;
  expect(calculateQuarterlyFinances([session], [], 100, {})).toEqual([
    // 60 Min = 1,2 Behandlungsstunden × 100 EUR
    { quarter: "2026 Q4", income: 120, costs: 0, profit: 120 },
  ]);
});
