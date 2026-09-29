import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("../../app/(app)/admin/ebm-staffel/actions", () => ({
  saveEbmStaffelAction: vi.fn(),
  deleteEbmStaffelAction: vi.fn(),
}));

import { EbmStaffelClient } from "../../app/(app)/admin/ebm-staffel/EbmStaffelClient";
import { deleteEbmStaffelAction, saveEbmStaffelAction } from "../../app/(app)/admin/ebm-staffel/actions";
import type { EbmStaffel } from "../../lib/ausbildungsregeln/model";

const DATUM_VERGEBEN = "Für dieses Datum gibt es schon eine Staffel";
const ALT: EbmStaffel = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  gueltigAb: "2000-01-01",
  stufen: [
    { kinderzahl: 3, total: 177, share: 88.5 },
    { kinderzahl: 4, total: 200, share: 100 },
  ],
};
const NEU: EbmStaffel = {
  id: "550e8400-e29b-41d4-a716-446655440002",
  gueltigAb: "2027-01-01",
  stufen: [
    { kinderzahl: 3, total: 180, share: 90 },
    { kinderzahl: 4, total: 205, share: 102.5 },
  ],
};

describe("EbmStaffelClient", () => {
  beforeEach(() => {
    vi.mocked(saveEbmStaffelAction).mockReset();
    vi.mocked(deleteEbmStaffelAction).mockReset();
  });

  it("listet die neueste Staffel zuerst, markiert die heute gültige und zeigt die größte Stufe als „und mehr“", () => {
    render(<EbmStaffelClient initial={[ALT, NEU]} heute="2026-09-28" />);
    const staffeln = screen.getAllByRole("region");
    expect(staffeln.map((r) => r.getAttribute("aria-label"))).toEqual(["Staffel ab 01.01.2027", "Staffel ab 01.01.2000"]);
    expect(within(staffeln[1]).getByText("gilt heute")).toBeDefined();
    expect(within(staffeln[0]).queryByText("gilt heute")).toBeNull();
    expect(within(staffeln[1]).getByText("4 und mehr")).toBeDefined();
    expect(within(staffeln[1]).getByText("88,50 EUR")).toBeDefined();
  });

  it("legt eine neue Staffel als Kopie der neuesten an und schickt Zahlen", async () => {
    vi.mocked(saveEbmStaffelAction).mockResolvedValue({ success: true, data: [ALT, NEU] });
    render(<EbmStaffelClient initial={[ALT]} heute="2026-09-28" />);
    fireEvent.click(screen.getByRole("button", { name: "Neue Staffel" }));
    expect((screen.getByLabelText("Gültig ab") as HTMLInputElement).value).toBe("2026-09-28");
    fireEvent.change(screen.getByLabelText("Gesamthonorar Stufe 1"), { target: { value: "180" } });
    fireEvent.change(screen.getByLabelText("Eigener Anteil Stufe 1"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Stufe hinzufügen" }));
    expect((screen.getByLabelText("Kinderzahl Stufe 3") as HTMLInputElement).value).toBe("5");
    fireEvent.click(screen.getByRole("button", { name: "Stufe 3 entfernen" }));
    fireEvent.click(screen.getByRole("button", { name: "Staffel speichern" }));
    await waitFor(() =>
      expect(saveEbmStaffelAction).toHaveBeenCalledWith({
        id: null,
        gueltigAb: "2026-09-28",
        stufen: [
          { kinderzahl: 3, total: 180, share: 90 },
          { kinderzahl: 4, total: 200, share: 100 },
        ],
      })
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: "Staffel speichern" })).toBeNull());
    expect(screen.getAllByRole("region")).toHaveLength(2);
  });

  it("schlägt bei ungültiger letzter Kinderzahl keine Kinderzahl vor statt „NaN“", () => {
    render(<EbmStaffelClient initial={[ALT]} heute="2026-09-28" />);
    fireEvent.click(screen.getByRole("button", { name: "Neue Staffel" }));
    fireEvent.change(screen.getByLabelText("Kinderzahl Stufe 2"), { target: { value: "vier" } });
    fireEvent.click(screen.getByRole("button", { name: "Stufe hinzufügen" }));
    expect((screen.getByLabelText("Kinderzahl Stufe 3") as HTMLInputElement).value).toBe("");
  });

  it("zeigt ein vergebenes Datum am Feld", async () => {
    vi.mocked(saveEbmStaffelAction).mockResolvedValue({ success: false, error: DATUM_VERGEBEN, fieldErrors: { gueltigAb: [DATUM_VERGEBEN] } });
    render(<EbmStaffelClient initial={[ALT]} heute="2026-09-28" />);
    fireEvent.click(screen.getByRole("button", { name: "Neue Staffel" }));
    fireEvent.click(screen.getByRole("button", { name: "Staffel speichern" }));
    const feld = screen.getByLabelText("Gültig ab");
    await waitFor(() => expect(feld.getAttribute("aria-invalid")).toBe("true"));
    expect(document.getElementById(feld.getAttribute("aria-describedby")!)?.textContent).toBe(DATUM_VERGEBEN);
  });

  it("bietet Löschen nur bei mehr als einer gespeicherten Staffel an; Standardwerte ohne Löschen", () => {
    const { unmount } = render(<EbmStaffelClient initial={[ALT]} heute="2026-09-28" />);
    expect(screen.queryByRole("button", { name: /Löschen/ })).toBeNull();
    unmount();
    render(<EbmStaffelClient initial={[{ ...ALT, id: null }]} heute="2026-09-28" />);
    expect(screen.getByText("Standardwerte, noch nicht gespeichert")).toBeDefined();
    expect(screen.queryByRole("button", { name: /Löschen/ })).toBeNull();
  });

  it("löscht nach Nachfrage", async () => {
    vi.mocked(deleteEbmStaffelAction).mockResolvedValue({ success: true, data: [ALT] });
    render(<EbmStaffelClient initial={[ALT, NEU]} heute="2026-09-28" />);
    const neu = screen.getByRole("region", { name: "Staffel ab 01.01.2027" });
    fireEvent.click(within(neu).getByRole("button", { name: /Löschen/ }));
    fireEvent.click(within(neu).getByRole("button", { name: "Ja, löschen" }));
    await waitFor(() => expect(deleteEbmStaffelAction).toHaveBeenCalledWith({ id: NEU.id }));
    await waitFor(() => expect(screen.getAllByRole("region")).toHaveLength(1));
  });

  it("liest Beträge deutsch: Tausenderpunkt wird mitgelesen, ein Punkt als Dezimaltrenner wird abgewiesen", async () => {
    vi.mocked(saveEbmStaffelAction).mockResolvedValue({ success: false, error: "Ungültige Eingabe" });
    render(<EbmStaffelClient initial={[ALT]} heute="2026-09-28" />);
    fireEvent.click(screen.getByRole("button", { name: "Neue Staffel" }));
    fireEvent.change(screen.getByLabelText("Gesamthonorar Stufe 1"), { target: { value: "1.000" } });
    fireEvent.change(screen.getByLabelText("Eigener Anteil Stufe 1"), { target: { value: "1.000,50" } });
    fireEvent.change(screen.getByLabelText("Gesamthonorar Stufe 2"), { target: { value: "200.5" } });
    fireEvent.change(screen.getByLabelText("Eigener Anteil Stufe 2"), { target: { value: " 99,5 " } });
    fireEvent.click(screen.getByRole("button", { name: "Staffel speichern" }));
    await waitFor(() =>
      expect(saveEbmStaffelAction).toHaveBeenCalledWith({
        id: null,
        gueltigAb: "2026-09-28",
        stufen: [
          { kinderzahl: 3, total: 1000, share: 1000.5 },
          { kinderzahl: 4, total: Number.NaN, share: 99.5 },
        ],
      })
    );
  });

  it("zeigt Stufenfehler an der betroffenen Eingabe und die Lückenlos-Meldung an den Kinderzahlen", async () => {
    vi.mocked(saveEbmStaffelAction).mockResolvedValue({
      success: false,
      error: "Ungültige Eingabe",
      fieldErrors: { "stufen.1.total": ["Bitte eine Zahl eingeben"], stufen: ["Kinderzahlen müssen lückenlos aufsteigen (z. B. 3, 4, 5 …)"] },
    });
    render(<EbmStaffelClient initial={[ALT]} heute="2026-09-28" />);
    fireEvent.click(screen.getByRole("button", { name: "Neue Staffel" }));
    fireEvent.click(screen.getByRole("button", { name: "Staffel speichern" }));
    const total = screen.getByLabelText("Gesamthonorar Stufe 2");
    await waitFor(() => expect(total.getAttribute("aria-invalid")).toBe("true"));
    expect(document.getElementById(total.getAttribute("aria-describedby")!)?.textContent).toBe("Gesamthonorar: Bitte eine Zahl eingeben");
    expect(screen.getByLabelText("Gesamthonorar Stufe 1").getAttribute("aria-invalid")).toBeNull();
    const kinder = screen.getByLabelText("Kinderzahl Stufe 1");
    expect(kinder.getAttribute("aria-invalid")).toBeNull();
    expect(document.getElementById(kinder.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Kinderzahlen müssen lückenlos aufsteigen (z. B. 3, 4, 5 …)"
    );
    expect(screen.getByRole("alert").textContent).toContain("Ungültige Eingabe");
  });
});
