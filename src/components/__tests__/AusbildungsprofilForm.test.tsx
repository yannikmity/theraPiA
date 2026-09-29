import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../app/(app)/admin/ausbildungsprofil/actions", () => ({
  saveAusbildungsprofilAction: vi.fn(),
  resetAusbildungsprofilAction: vi.fn(),
}));

import { AusbildungsprofilForm } from "../../app/(app)/admin/ausbildungsprofil/AusbildungsprofilForm";
import { resetAusbildungsprofilAction, saveAusbildungsprofilAction } from "../../app/(app)/admin/ausbildungsprofil/actions";
import { standardRegelwerk } from "../../lib/ausbildungsregeln/resolve";
import { MELDUNG_KRITISCH } from "../../lib/ausbildungsregeln/validation";

const STANDARD = standardRegelwerk().regeln;
const daten = (quelle: "standard" | "instanz") => ({ regeln: STANDARD, quelle, standard: STANDARD });

describe("AusbildungsprofilForm", () => {
  beforeEach(() => {
    vi.mocked(saveAusbildungsprofilAction).mockReset();
    vi.mocked(resetAusbildungsprofilAction).mockReset();
  });

  it("zeigt die Werte mit Standard und schickt Zahlen – Komma erlaubt", async () => {
    vi.mocked(saveAusbildungsprofilAction).mockResolvedValue({
      success: true,
      data: { regeln: { ...STANDARD, verhaeltnisWarnung: 3.5 }, quelle: "instanz", standard: STANDARD },
    });
    render(<AusbildungsprofilForm initial={daten("instanz")} />);
    expect((screen.getByLabelText("Ziel Behandlungsstunden") as HTMLInputElement).value).toBe("600");
    expect(screen.getAllByText("Standard: 1 : 4")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Soll-Verhältnis (1 : x)"), { target: { value: "3,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Ausbildungsprofil speichern" }));
    await waitFor(() => expect(saveAusbildungsprofilAction).toHaveBeenCalledWith({ ...STANDARD, verhaeltnisWarnung: 3.5 }));
    expect(await screen.findByText("Gespeichert.")).toBeDefined();
    expect((screen.getByLabelText("Soll-Verhältnis (1 : x)") as HTMLInputElement).value).toBe("3,5");
  });

  it("zeigt Feldfehler am Feld", async () => {
    vi.mocked(saveAusbildungsprofilAction).mockResolvedValue({
      success: false,
      error: "Ungültige Eingabe",
      fieldErrors: { verhaeltnisKritisch: [MELDUNG_KRITISCH] },
    });
    render(<AusbildungsprofilForm initial={daten("instanz")} />);
    fireEvent.click(screen.getByRole("button", { name: "Ausbildungsprofil speichern" }));
    const feld = screen.getByLabelText("Kritisch ab (1 : x)");
    await waitFor(() => expect(feld.getAttribute("aria-invalid")).toBe("true"));
    expect(screen.getByText(MELDUNG_KRITISCH).id).toBe(feld.getAttribute("aria-describedby"));
    expect(screen.getByRole("alert").textContent).toContain("Ungültige Eingabe");
    expect(screen.getByRole("alert").textContent).not.toContain("verhaeltnisKritisch");
  });

  it("meldet nach dem Zurücksetzen die Standardwerte statt „Gespeichert.“", async () => {
    vi.mocked(resetAusbildungsprofilAction).mockResolvedValue({ success: true, data: daten("standard") });
    render(<AusbildungsprofilForm initial={{ ...daten("instanz"), regeln: { ...STANDARD, behandlungsstundenZiel: 500 } }} />);
    fireEvent.click(screen.getByRole("button", { name: /Auf Standardwerte zurücksetzen/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, zurücksetzen" }));
    await waitFor(() => expect(resetAusbildungsprofilAction).toHaveBeenCalledWith({}));
    expect((await screen.findByRole("status")).textContent).toBe("Auf Standardwerte zurückgesetzt.");
    expect(screen.queryByText("Gespeichert.")).toBeNull();
    expect((screen.getByLabelText("Ziel Behandlungsstunden") as HTMLInputElement).value).toBe("600");
  });

  it("weist auf Standardwerte hin und sperrt Zurücksetzen, solange kein Profil gespeichert ist", () => {
    render(<AusbildungsprofilForm initial={daten("standard")} />);
    expect(screen.getByText("Noch kein Profil gespeichert – es gelten die Standardwerte.")).toBeDefined();
    expect((screen.getByRole("button", { name: /Auf Standardwerte zurücksetzen/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
