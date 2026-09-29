// @vitest-environment node
import { describe, it, expect } from "vitest";
import { APP_TIME_ZONE, addDaysIso, daysBetweenIso, formatDateDe, formatWeekdayDateDe, todayIso } from "../dates";

describe("dates", () => {
  it("verwendet Europe/Berlin als App-Zeitzone", () => {
    expect(APP_TIME_ZONE).toBe("Europe/Berlin");
  });

  it("formatiert YYYY-MM-DD ohne Verschiebung als dd.MM.yyyy", () => {
    expect(formatDateDe("2026-01-05")).toBe("05.01.2026");
    expect(formatDateDe("2026-12-31")).toBe("31.12.2026");
  });

  it("formatiert ISO-Zeitstempel als Kalendertag in Europe/Berlin", () => {
    // 22:30 UTC = 00:30 MESZ am Folgetag
    expect(formatDateDe("2026-09-25T22:30:00Z")).toBe("26.09.2026");
    expect(formatDateDe("2026-09-26T12:00:00.000Z")).toBe("26.09.2026");
    // 23:30 UTC im Winter = 00:30 MEZ am Folgetag (Jahreswechsel)
    expect(formatDateDe("2026-12-31T23:30:00.000Z")).toBe("01.01.2027");
  });

  it("liefert das heutige Datum als Kalendertag in Europe/Berlin", () => {
    expect(todayIso(new Date("2026-09-25T22:30:00Z"))).toBe("2026-09-26");
    expect(todayIso(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(todayIso(new Date("2026-09-26T07:30:00Z"))).toBe("2026-09-26");
  });

  it("rechnet Kalendertage auf YYYY-MM-DD ohne Zeitzonenversatz", () => {
    expect(addDaysIso("2026-09-27", -7)).toBe("2026-09-20");
    expect(addDaysIso("2026-09-28", 7)).toBe("2026-10-05");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    // Über das Ende der Sommerzeit (25.10.2026) hinweg verschiebt sich kein Kalendertag.
    expect(addDaysIso("2026-10-24", 7)).toBe("2026-10-31");
    expect(daysBetweenIso("2026-09-27", "2026-09-30")).toBe(3);
    expect(daysBetweenIso("2026-09-30", "2026-09-30")).toBe(0);
    expect(daysBetweenIso("2026-10-01", "2026-12-31")).toBe(91);
  });

  it("formatiert Wochentag und Datum auf Deutsch", () => {
    expect(formatWeekdayDateDe("2026-09-21")).toBe("Mo, 21.09.2026");
    expect(formatWeekdayDateDe("2026-09-27")).toBe("So, 27.09.2026");
  });
});
