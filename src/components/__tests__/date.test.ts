import { describe, it, expect } from "vitest";
import { dateError } from "../forms/date";

describe("dateError", () => {
  it("prüft ein Pflichtdatum mit denselben Worten wie das Server-Schema", () => {
    expect(dateError("2026-09-21")).toBeUndefined();
    expect(dateError("")).toBe("Bitte ein Datum angeben");
    expect(dateError("21.09.2026")).toBe("Ungültiges Datumsformat");
  });
});
