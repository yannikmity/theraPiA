// @vitest-environment node
import { describe, it, expect } from "vitest";
import { compareNatural } from "../collation";

describe("compareNatural", () => {
  it("sortiert Zahlen im Text numerisch: A-2 vor A-10", () => {
    expect(["A-10", "A-2", "A-1", "B-1"].sort(compareNatural)).toEqual(["A-1", "A-2", "A-10", "B-1"]);
    expect(compareNatural("A-2", "A-10")).toBeLessThan(0);
  });

  it("ordnet Umlaute nach deutschen Regeln ein", () => {
    expect(["P-1", "Ö-1", "O-1"].sort(compareNatural)).toEqual(["O-1", "Ö-1", "P-1"]);
  });
});
