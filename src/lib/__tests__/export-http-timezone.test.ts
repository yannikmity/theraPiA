// @vitest-environment node
// Server in einer anderen Zeitzone (Container ohne TZ laufen in UTC, hier bewusst westlich davon): der
// Dateiname muss trotzdem den Berliner Kalendertag tragen (#47).
// TZ setzt das Vitest-Projekt „westlich-von-utc“ (vitest.config.ts).

import { it, expect } from "vitest";
import { exportFilename } from "../export/http";

it("nimmt den Kalendertag in Europe/Berlin, nicht den der Server-Uhr", () => {
  expect(new Date(2026, 8, 26).getTimezoneOffset()).toBeGreaterThan(0);
  // 22:30 UTC am 25.09. ist in New York noch der 25., in Berlin schon der 26.
  expect(exportFilename("patientinnen", "csv", new Date("2026-09-25T22:30:00Z"))).toBe("therapia-patientinnen-2026-09-26.csv");
});
