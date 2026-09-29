import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../app/(app)/finances/actions", () => ({ saveFinancialSettings: vi.fn() }));

import { FinancesClient } from "../../app/(app)/finances/FinancesClient";
import { saveFinancialSettings } from "../../app/(app)/finances/actions";
import type { FinancialSettings } from "@/types";

const settings: FinancialSettings = { incomePerHour: 85, supervisionCosts: {}, plannedSessionsPerWeek: null };
const props = { initialSettings: settings, initialSupervisors: [], initialQuarters: [], initialTotalIncome: 0, initialTotalCosts: 0, expenseYears: [] };
const saved = (s: FinancialSettings) => ({
  success: true as const,
  data: { settings: s, supervisors: [], quarters: [], totalIncome: 0, totalCosts: 0, expenseYears: [] },
});

describe("FinancesClient – geplante Sitzungen pro Woche", () => {
  // Blockkörper: gibt beforeEach eine Funktion zurück, ruft Vitest sie nach dem Test als Aufräumfunktion auf – hier den Mock.
  beforeEach(() => {
    vi.mocked(saveFinancialSettings).mockReset();
  });

  it("zeigt das Feld leer (Schnitt) und speichert eine Zahl", async () => {
    vi.mocked(saveFinancialSettings).mockResolvedValue(saved({ ...settings, plannedSessionsPerWeek: 6 }));
    render(<FinancesClient {...props} />);
    const field = screen.getByLabelText("Geplante Sitzungen pro Woche (optional)") as HTMLInputElement;
    expect(field.value).toBe("");
    expect(screen.getByText(/Schnitt der letzten 8 Wochen/)).toBeDefined();
    fireEvent.change(field, { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Einstellungen speichern" }));
    await waitFor(() =>
      expect(saveFinancialSettings).toHaveBeenCalledWith({ incomePerHour: 85, supervisionCosts: {}, plannedSessionsPerWeek: 6 })
    );
  });

  it("ein geleertes Feld speichert null", async () => {
    vi.mocked(saveFinancialSettings).mockResolvedValue(saved(settings));
    render(<FinancesClient {...props} initialSettings={{ ...settings, plannedSessionsPerWeek: 6 }} />);
    const field = screen.getByLabelText("Geplante Sitzungen pro Woche (optional)") as HTMLInputElement;
    expect(field.value).toBe("6");
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Einstellungen speichern" }));
    await waitFor(() =>
      expect(saveFinancialSettings).toHaveBeenCalledWith({ incomePerHour: 85, supervisionCosts: {}, plannedSessionsPerWeek: null })
    );
  });

  it("zeigt einen abgelehnten Aufruf (Netz weg) unmittelbar vor dem Speichern-Knopf", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(saveFinancialSettings).mockRejectedValue(new TypeError("Failed to fetch"));
    render(<FinancesClient {...props} />);
    const button = screen.getByRole("button", { name: "Einstellungen speichern" });
    fireEvent.click(button);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Ein unerwarteter Fehler ist aufgetreten");
    expect(alert.nextElementSibling).toBe(button);
    expect(logged).toHaveBeenCalledWith("Server-Action fehlgeschlagen:", expect.any(TypeError));
    logged.mockRestore();
  });
});
