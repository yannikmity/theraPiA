import { describe, it, expect } from "vitest";
import { isPageMarginBoxParseError } from "./helpers/jsdom-noise";

describe("Test-Setup (jsdom)", () => {
  it("stellt einen ResizeObserver bereit, ohne dass ein Test ihn stubbt", () => {
    const observer = new ResizeObserver(() => {});
    expect(() => {
      observer.observe(document.body);
      observer.disconnect();
    }).not.toThrow();
  });

  it("erkennt nur den Parse-Fehler der @page-Randboxen als Rauschen", () => {
    const parse = (detail: string) => Object.assign(new Error("Could not parse CSS stylesheet"), { detail });
    expect(isPageMarginBoxParseError(parse('@page { @bottom-center { content: "x"; } }'))).toBe(true);
    expect(isPageMarginBoxParseError(parse(".kaputt { color: red"))).toBe(false);
    expect(isPageMarginBoxParseError(Object.assign(new Error("Not implemented: navigation"), { detail: "@bottom-center {" }))).toBe(false);
  });
});
