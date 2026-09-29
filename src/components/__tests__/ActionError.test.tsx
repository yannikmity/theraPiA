import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActionError, errorAt } from "../ActionError";

describe("ActionError", () => {
  it("zeigt nichts ohne Fehler und die Meldung samt Feldfehlern bei einem gescheiterten Ergebnis", () => {
    const { container, rerender } = render(<ActionError result={null} />);
    expect(container.innerHTML).toBe("");
    rerender(<ActionError result={{ success: true, data: 1 }} />);
    expect(container.innerHTML).toBe("");
    rerender(<ActionError result={{ success: false, error: "Ungültige Eingabe", fieldErrors: { durationMinutes: ["Dauer muss mindestens 1 Minute sein"] } }} />);
    expect(screen.getByRole("alert").textContent).toContain("Ungültige Eingabe");
    expect(screen.getByRole("alert").textContent).toContain("durationMinutes: Dauer muss mindestens 1 Minute sein");
  });

  it("errorAt liefert den Fehler nur für die Stelle, an der die Aktion gescheitert ist", () => {
    const error = { scope: "session:t-1", result: { success: false as const, error: "Nicht gefunden" } };
    expect(errorAt(error, "session:t-1")).toBe(error.result);
    expect(errorAt(error, "session:t-2")).toBeNull();
    expect(errorAt(null, "session:t-1")).toBeNull();
  });
});
