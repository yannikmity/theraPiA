import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { blendHex, contrastRatio, parseThemeTokens } from "../theme-contrast";

const css = readFileSync(path.resolve(__dirname, "../../app/globals.css"), "utf8");
const [light, dark] = parseThemeTokens(css);

// Text auf Fläche: WCAG AA für normalen Text verlangt 4,5:1.
const AA_TEXT = 4.5;
const PAIRS: [string, string][] = [
  ["foreground", "background"],
  ["foreground", "muted"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "sidebar"],
  ["muted-foreground", "muted"],
  ["muted-foreground", "primary-soft"],
  ["primary-foreground", "primary"],
  ["primary", "card"],
  ["primary", "background"],
  ["primary", "primary-soft"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["destructive-foreground", "destructive"],
  ["destructive", "card"],
  ["destructive", "destructive-soft"],
  ["success-foreground", "success"],
  ["success", "card"],
  ["success", "success-soft"],
  ["warning-foreground", "warning"],
  ["warning", "card"],
  ["warning", "background"],
  ["warning", "warning-soft"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-primary-foreground", "sidebar-primary"],
  ["sidebar-accent-foreground", "sidebar-accent"],
];

// Nicht-Text-Komponenten auf ihrer Fläche (WCAG 1.4.11, #43): Feldrahmen (--input) und Fokusring (--ring) brauchen 3:1.
const AA_UI = 3;
const UI_PAIRS: [string, string][] = [
  ["input", "card"],
  ["input", "background"],
  ["input", "muted"],
  ["input", "primary-soft"],
  ["ring", "card"],
  ["ring", "background"],
];

// Dunkle Feldflächen (#56): Tailwind-Klassen dark:bg-input/NN bzw. dark:hover:bg-input/NN direkt aus den Komponenten
// lesen, damit Test und Oberfläche nicht auseinanderlaufen. Text (Wert) und Platzhalter (muted-foreground) brauchen
// auf der gemischten Fläche 4,5:1 – über Karte und Seitenhintergrund.
const component = (file: string) => readFileSync(path.resolve(__dirname, "../../components/ui", file), "utf8");
function alphaOf(source: string, prefix: string): number {
  const match = new RegExp(`(?:^|[\\s"])${prefix}bg-input/(\\d+)`).exec(source);
  if (!match) throw new Error(`${prefix}bg-input/NN nicht gefunden`);
  return Number(match[1]) / 100;
}
const FIELD_FILLS: [string, number][] = [
  ["Eingabefeld", alphaOf(component("input.tsx"), "dark:")],
  ["Textfeld", alphaOf(component("textarea.tsx"), "dark:")],
  ["Auswahl", alphaOf(component("native-select.tsx"), "dark:")],
  ["Auswahl (Hover)", alphaOf(component("native-select.tsx"), "dark:hover:")],
];

describe("Theme-Kontrast (WCAG AA)", () => {
  it("berechnet den Kontrast nach WCAG 2", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    // Das alte Primärblau reicht für weißen Text nicht (3,98:1) – deshalb #2471a3 als --primary.
    expect(contrastRatio("#2e86c1", "#ffffff")).toBeLessThan(AA_TEXT);
    expect(contrastRatio("#2471a3", "#ffffff")).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("liest helles und dunkles Schema mit denselben Tokens aus globals.css", () => {
    expect(Object.keys(light).length).toBeGreaterThanOrEqual(30);
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
    for (const [fg, bg] of PAIRS) {
      expect(light[fg], `Token ${fg} fehlt`).toBeDefined();
      expect(light[bg], `Token ${bg} fehlt`).toBeDefined();
    }
  });

  it.each([
    ["hell", light],
    ["dunkel", dark],
  ])("%s: alle Text-auf-Fläche-Paare erreichen 4,5:1", (_, tokens) => {
    const failures = PAIRS.filter(([fg, bg]) => contrastRatio(tokens[fg], tokens[bg]) < AA_TEXT).map(
      ([fg, bg]) => `${fg} auf ${bg}: ${contrastRatio(tokens[fg], tokens[bg]).toFixed(2)}`
    );
    expect(failures).toEqual([]);
  });

  it.each([
    ["hell", light],
    ["dunkel", dark],
  ])("%s: Feldrahmen und Fokusring erreichen 3:1 auf ihren Flächen", (_, tokens) => {
    const failures = UI_PAIRS.filter(([fg, bg]) => contrastRatio(tokens[fg], tokens[bg]) < AA_UI).map(
      ([fg, bg]) => `${fg} auf ${bg}: ${contrastRatio(tokens[fg], tokens[bg]).toFixed(2)}`
    );
    expect(failures).toEqual([]);
  });

  it("mischt eine Farbe mit Deckkraft deckend über eine Fläche", () => {
    expect(blendHex("#ffffff", "#000000", 0.5)).toBe("#808080");
    expect(blendHex("#728496", "#172431", 0.5)).toBe("#455464");
    expect(blendHex("#728496", "#172431", 0)).toBe("#172431");
  });

  it("dunkel: Wert und Platzhalter erreichen auf allen Feldflächen 4,5:1 – auch beim Hover der Auswahl", () => {
    const failures: string[] = [];
    for (const [field, alpha] of FIELD_FILLS) {
      for (const surface of ["card", "background"]) {
        const fill = blendHex(dark.input, dark[surface], alpha);
        for (const text of ["foreground", "muted-foreground"]) {
          const ratio = contrastRatio(dark[text], fill);
          if (ratio < AA_TEXT) failures.push(`${text} auf ${field} über ${surface}: ${ratio.toFixed(2)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("dunkel: der Hover der Auswahl ist sichtbar anders als ihre Fläche", () => {
    const fill = FIELD_FILLS.find(([f]) => f === "Auswahl")![1];
    const hover = FIELD_FILLS.find(([f]) => f === "Auswahl (Hover)")![1];
    expect(hover).toBeGreaterThan(fill);
  });
});
