// @vitest-environment node
import { describe, it, expect } from "vitest";
import { sichtbareKategorien, SUPERVISION_KIND_LABELS, SUPERVISION_SETTING_LABELS } from "../labels";

const stunden = (werte: Partial<Record<string, number>> = {}) => ({
  sprechstunde: 0,
  probatorik: 0,
  behandlung: 0,
  bezugsperson: 0,
  gespraechsziffer: 0,
  ...werte,
});

describe("sichtbareKategorien (#66)", () => {
  it("zeigt ohne Stunden nur Probatorik, Behandlung und Bezugsperson", () => {
    expect(sichtbareKategorien(stunden())).toEqual(["probatorik", "behandlung", "bezugsperson"]);
  });

  it("nimmt Sprechstunde und Gesprächsziffer mit Stunden in Kategorie-Reihenfolge dazu", () => {
    expect(sichtbareKategorien(stunden({ sprechstunde: 1, gespraechsziffer: 0.2 }))).toEqual([
      "sprechstunde",
      "probatorik",
      "behandlung",
      "bezugsperson",
      "gespraechsziffer",
    ]);
  });
});

describe("Supervisions-Labels", () => {
  it("trennt Setting (Einzel/Gruppe) von der Art des Besprochenen (Einzel-/Gruppentherapie)", () => {
    expect(SUPERVISION_SETTING_LABELS).toEqual({ einzel: "Einzel", gruppe: "Gruppe" });
    expect(SUPERVISION_KIND_LABELS).toEqual({ individual: "Einzeltherapie", group: "Gruppentherapie" });
  });
});
