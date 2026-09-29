import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../app/(app)/profile/regeln/actions", () => ({
  saveAbweichungenAction: vi.fn(),
  resetAbweichungenAction: vi.fn(),
}));

import { RegelAbweichungenForm } from "../../app/(app)/profile/regeln/RegelAbweichungenForm";
import { resetAbweichungenAction, saveAbweichungenAction } from "../../app/(app)/profile/regeln/actions";
import { KEINE_ABWEICHUNGEN, type RegelAbweichungen } from "../../lib/ausbildungsregeln/model";
import { resolveRegelwerk, standardRegelwerk } from "../../lib/ausbildungsregeln/resolve";

const INSTANZ = { ...standardRegelwerk().regeln, behandlungsstundenZiel: 500 };
const regelwerk = (abweichungen: RegelAbweichungen | null = null) => resolveRegelwerk({ instanz: INSTANZ, abweichungen, ebmStaffeln: [] });

describe("RegelAbweichungenForm", () => {
  beforeEach(() => {
    vi.mocked(saveAbweichungenAction).mockReset();
    vi.mocked(saveAbweichungenAction).mockImplementation(async (eingabe) => ({ success: true, data: regelwerk(eingabe) }));
    vi.mocked(resetAbweichungenAction).mockReset();
    vi.mocked(resetAbweichungenAction).mockResolvedValue({ success: true, data: regelwerk() });
  });

  it("zeigt geerbte Werte mit Herkunft und ohne Eingabefelder", () => {
    render(<RegelAbweichungenForm initial={regelwerk()} />);
    expect(screen.getByRole("group", { name: "Behandlungsstunden" }).textContent).toContain("500 (Ausbildungsprofil der Instanz)");
    expect(screen.getByRole("group", { name: "Verhältnis Supervision : Therapie" }).textContent).toContain("1 : 4 (Ausbildungsprofil der Instanz)");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Alle zurücksetzen/ })).toBeNull();
  });

  it("nennt ohne Instanzprofil den Standardwert als Herkunft", () => {
    render(<RegelAbweichungenForm initial={standardRegelwerk()} />);
    expect(screen.getByRole("group", { name: "Behandlungsstunden" }).textContent).toContain("600 (Standardwert)");
  });

  it("legt eine Abweichung paarweise fest und schickt null für geerbte Gruppen", async () => {
    render(<RegelAbweichungenForm initial={regelwerk()} />);
    fireEvent.click(screen.getByRole("button", { name: "Verhältnis Supervision : Therapie: Abweichung festlegen" }));
    const soll = screen.getByLabelText("Soll-Verhältnis (1 : x)") as HTMLInputElement;
    expect(soll.value).toBe("4");
    fireEvent.change(soll, { target: { value: "3,5" } });
    fireEvent.change(screen.getByLabelText("Kritisch ab (1 : x)"), { target: { value: "4,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Regeln speichern" }));
    await waitFor(() =>
      expect(saveAbweichungenAction).toHaveBeenCalledWith({ ...KEINE_ABWEICHUNGEN, verhaeltnisWarnung: 3.5, verhaeltnisKritisch: 4.5 })
    );
    expect((await screen.findByRole("status")).textContent).toContain("Gespeichert");
    expect(screen.getByRole("button", { name: /Alle zurücksetzen/ })).toBeDefined();
  });

  it("setzt eine Gruppe per Zurücksetzen wieder auf den geerbten Wert", async () => {
    render(<RegelAbweichungenForm initial={regelwerk({ ...KEINE_ABWEICHUNGEN, behandlungsstundenZiel: 450 })} />);
    expect((screen.getByLabelText("Ziel Behandlungsstunden") as HTMLInputElement).value).toBe("450");
    fireEvent.click(screen.getByRole("button", { name: "Behandlungsstunden: auf den geerbten Wert zurücksetzen" }));
    fireEvent.click(screen.getByRole("button", { name: "Regeln speichern" }));
    await waitFor(() => expect(saveAbweichungenAction).toHaveBeenCalledWith({ ...KEINE_ABWEICHUNGEN }));
  });

  it("setzt per „Alle zurücksetzen“ alle Abweichungen zurück und meldet das", async () => {
    render(<RegelAbweichungenForm initial={regelwerk({ ...KEINE_ABWEICHUNGEN, behandlungsstundenZiel: 450 })} />);
    fireEvent.click(screen.getByRole("button", { name: /Alle zurücksetzen/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, zurücksetzen" }));
    await waitFor(() => expect(resetAbweichungenAction).toHaveBeenCalledWith({}));
    expect((await screen.findByRole("status")).textContent).toBe(
      "Zurückgesetzt – es gelten wieder die Werte aus dem Ausbildungsprofil der Instanz."
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("group", { name: "Behandlungsstunden" }).textContent).toContain("500 (Ausbildungsprofil der Instanz)");
    expect(screen.queryByRole("button", { name: /Alle zurücksetzen/ })).toBeNull();
  });

  it("nennt nach dem Zurücksetzen ohne Instanzprofil die Standardwerte", async () => {
    vi.mocked(resetAbweichungenAction).mockResolvedValue({ success: true, data: standardRegelwerk() });
    render(
      <RegelAbweichungenForm
        initial={resolveRegelwerk({ instanz: null, abweichungen: { ...KEINE_ABWEICHUNGEN, behandlungsstundenZiel: 450 }, ebmStaffeln: [] })}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Alle zurücksetzen/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, zurücksetzen" }));
    expect((await screen.findByRole("status")).textContent).toBe("Zurückgesetzt – es gelten wieder die Standardwerte.");
  });

  it("zeigt Feldfehler am Feld", async () => {
    vi.mocked(saveAbweichungenAction).mockResolvedValue({ success: false, error: "Ungültige Eingabe", fieldErrors: { behandlungsstundenZiel: ["Mindestens 1"] } });
    render(<RegelAbweichungenForm initial={regelwerk({ ...KEINE_ABWEICHUNGEN, behandlungsstundenZiel: 450 })} />);
    const feld = screen.getByLabelText("Ziel Behandlungsstunden");
    fireEvent.change(feld, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Regeln speichern" }));
    await waitFor(() => expect(feld.getAttribute("aria-invalid")).toBe("true"));
    expect(screen.getByText("Mindestens 1").id).toBe(feld.getAttribute("aria-describedby"));
  });

  it("liest „1.000“ als Tausend und nicht still als 1", async () => {
    render(<RegelAbweichungenForm initial={regelwerk({ ...KEINE_ABWEICHUNGEN, behandlungsstundenZiel: 450 })} />);
    fireEvent.change(screen.getByLabelText("Ziel Behandlungsstunden"), { target: { value: "1.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Regeln speichern" }));
    await waitFor(() => expect(saveAbweichungenAction).toHaveBeenCalledWith({ ...KEINE_ABWEICHUNGEN, behandlungsstundenZiel: 1000 }));
  });
});
