// @vitest-environment node
import { describe, it, expect } from "vitest";
import { resolveNachweisFilter } from "../nachweis-filter";

const TODAY = new Date(2026, 8, 26);
const UUID = "550e8400-e29b-41d4-a716-446655440000";
const QUARTAL = { from: "2026-07-01", to: "2026-09-30", supervisorId: null };

describe("resolveNachweisFilter", () => {
  it("nimmt ohne Parameter das aktuelle Quartal", () => {
    expect(resolveNachweisFilter({}, TODAY)).toEqual({ filter: QUARTAL, invalid: false });
  });

  it("übernimmt gültige Parameter, leere Supervisor:in ist null, Mehrfachwerte zählen einmal", () => {
    expect(resolveNachweisFilter({ from: "2026-01-01", to: "2026-03-31", supervisor: UUID }, TODAY)).toEqual({
      filter: { from: "2026-01-01", to: "2026-03-31", supervisorId: UUID },
      invalid: false,
    });
    expect(resolveNachweisFilter({ from: "2026-01-01", to: "2026-03-31", supervisor: "" }, TODAY).filter.supervisorId).toBeNull();
    expect(resolveNachweisFilter({ from: ["2026-01-01", "x"], to: "2026-03-31" }, TODAY).filter.from).toBe("2026-01-01");
  });

  it("ergänzt eine fehlende Grenze aus dem aktuellen Quartal", () => {
    expect(resolveNachweisFilter({ from: "2026-01-01" }, TODAY).filter).toEqual({ from: "2026-01-01", to: "2026-09-30", supervisorId: null });
    expect(resolveNachweisFilter({ supervisor: UUID }, TODAY).filter).toEqual({ ...QUARTAL, supervisorId: UUID });
  });

  it("fällt bei ungültigen Werten auf das aktuelle Quartal zurück und meldet das", () => {
    expect(resolveNachweisFilter({ from: "31.03.2026", to: "2026-03-31" }, TODAY)).toEqual({ filter: QUARTAL, invalid: true });
    expect(resolveNachweisFilter({ from: "2026-03-31", to: "2026-01-01" }, TODAY)).toEqual({ filter: QUARTAL, invalid: true });
    expect(resolveNachweisFilter({ supervisor: "keine-uuid" }, TODAY)).toEqual({ filter: QUARTAL, invalid: true });
  });

  it("lehnt Kalenderdaten ab, die es nicht gibt", () => {
    expect(resolveNachweisFilter({ from: "2026-02-30", to: "2026-03-31" }, TODAY)).toEqual({ filter: QUARTAL, invalid: true });
    expect(resolveNachweisFilter({ from: "2026-01-01", to: "2026-02-30" }, TODAY)).toEqual({ filter: QUARTAL, invalid: true });
    expect(resolveNachweisFilter({ from: "2026-13-01", to: "2026-12-31" }, TODAY)).toEqual({ filter: QUARTAL, invalid: true });
    expect(resolveNachweisFilter({ from: "2026-01-01", to: "2026-13-01" }, TODAY)).toEqual({ filter: QUARTAL, invalid: true });
  });
});
