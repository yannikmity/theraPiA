import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
// Echtes next/navigation (runAction nutzt unstable_rethrow), nur der Router ist gemockt.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
vi.mock("../../lib/analytics/track", () => ({ track: vi.fn(), trackFailure: vi.fn() }));
vi.mock("../../app/(app)/patients/[id]/actions", () => ({
  updatePatient: vi.fn(),
  renamePatient: vi.fn(),
  updateTherapySession: vi.fn(),
  deleteTherapySession: vi.fn(),
  deletePatient: vi.fn(),
}));

import { PatientDetailClient } from "../../app/(app)/patients/[id]/PatientDetailClient";
import { pressEnter, submitButtons } from "../../lib/__tests__/helpers/form-submit";
import {
  deletePatient,
  deleteTherapySession,
  renamePatient,
  updatePatient,
  updateTherapySession,
} from "../../app/(app)/patients/[id]/actions";
import { newPatientId, newTherapySessionId, type Patient, type TherapySession } from "@/types";
import { standardRegelwerk } from "../../lib/ausbildungsregeln/resolve";
import { MELDUNG_CHIFFRE_PFLICHT, MELDUNG_CHIFFRE_VERGEBEN } from "../../lib/constants";

const P1 = "550e8400-e29b-41d4-a716-446655440001";
const patient: Patient = {
  id: newPatientId(P1),
  chiffre: "A-1",
  therapyType: "langzeittherapie",
  startDate: "2026-01-05",
  endDate: null,
  isActive: true,
  createdAt: "2026-01-05T08:00:00.000Z",
  antragsdatum: null,
  beantragteStunden: null,
  genehmigungsdatum: null,
  sprechstundenAmbulanz: 0,
};
const session = (id: string, date: string): TherapySession => ({
  id: newTherapySessionId(id),
  patientId: newPatientId(P1),
  date,
  durationMinutes: 50,
  notes: "",
  category: "behandlung",
});
const props = {
  initialPatient: patient,
  initialTherapySessions: [session("t-1", "2026-09-14"), session("t-2", "2026-09-21")],
  initialSupervisionSessions: [],
  initialSupervisors: [],
  regeln: standardRegelwerk().regeln,
};
const card = (heading: string) => screen.getByRole("heading", { name: heading }).closest("[data-slot=card]") as HTMLElement;

describe("PatientDetailClient", () => {
  beforeEach(() => {
    vi.mocked(deletePatient).mockReset();
    vi.mocked(deleteTherapySession).mockReset();
    vi.mocked(updatePatient).mockReset();
    vi.mocked(renamePatient).mockReset();
    vi.mocked(updateTherapySession).mockReset();
    push.mockReset();
  });

  it("zeigt den Fehler beim Löschen der Patient:in in der Karte der Aktion, nicht oben auf der Seite", async () => {
    vi.mocked(deletePatient).mockResolvedValue({ success: false, error: "Patient:in nicht gefunden" });
    render(<PatientDetailClient {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Patient:in löschen" }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, endgültig löschen" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Patient:in nicht gefunden"));
    expect(card("Patient:in löschen").contains(screen.getByRole("alert"))).toBe(true);
    expect(push).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Patient:in löschen" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("fängt einen abgelehnten Aufruf (Netz weg) beim Löschen einer Sitzung ab und zeigt die Meldung in der Zeile", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(deleteTherapySession).mockRejectedValue(new TypeError("Failed to fetch"));
    render(<PatientDetailClient {...props} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Sitzung löschen" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Ja, löschen" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Ein unerwarteter Fehler ist aufgetreten"));
    const row = screen.getAllByRole("button", { name: "Sitzung löschen" })[0].parentElement as HTMLElement;
    expect(within(row).getByRole("alert")).toBeDefined();
    expect(within(card("Therapiesitzungen (2)")).getAllByRole("alert")).toHaveLength(1);
    expect(logged).toHaveBeenCalledWith("Server-Action fehlgeschlagen:", expect.any(TypeError));
    logged.mockRestore();
  });

  it("verwirft den Speicherfehler der Sitzung beim Abbrechen des Bearbeitens", async () => {
    vi.mocked(updateTherapySession).mockResolvedValue({ success: false, error: "Sitzung nicht gefunden" });
    render(<PatientDetailClient {...props} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Sitzung bearbeiten" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Sitzung nicht gefunden"));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Sitzung bearbeiten" })[0]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("zeigt einen Fehler beim Antrag in der Antrag-Karte", async () => {
    vi.mocked(updatePatient).mockResolvedValue({ success: false, error: "Ungültige Eingabe", fieldErrors: { beantragteStunden: ["Ganze Zahl"] } });
    render(<PatientDetailClient {...props} />);
    fireEvent.change(screen.getByLabelText("Beantragte Behandlungsstunden"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Antrag speichern" }));
    await waitFor(() => expect(card("Antrag").contains(screen.getByRole("alert"))).toBe(true));
    expect(screen.getByRole("alert").textContent).toContain("Ganze Zahl");
  });

  it("speichert Genehmigungsdatum und Sprechstunden der Ambulanzleitung mit dem Antrag (#66)", async () => {
    vi.mocked(updatePatient).mockResolvedValue({ success: false, error: "egal" });
    render(<PatientDetailClient {...props} />);
    fireEvent.change(screen.getByLabelText("Genehmigt am"), { target: { value: "2026-02-20" } });
    fireEvent.change(screen.getByLabelText("Sprechstunden durch die Ambulanzleitung"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Antrag speichern" }));
    await waitFor(() =>
      expect(updatePatient).toHaveBeenCalledWith(expect.objectContaining({ genehmigungsdatum: "2026-02-20", sprechstundenAmbulanz: 2 }))
    );
  });

  it("stapelt die Kontingent-Kacheln auf dem Handy und zeigt sie ab sm in drei Spalten (#66)", () => {
    render(<PatientDetailClient {...props} />);
    const grid = screen.getByText(/Termine übrig · Sprechstunde/).closest(".grid");
    expect(grid?.className.split(" ")).toEqual(expect.arrayContaining(["grid-cols-1", "sm:grid-cols-3"]));
  });

  it("formuliert die Zahl der mitgelöschten Sitzungen ohne „1 Sitzungen“ und „Sitzung(en)“", () => {
    const { unmount } = render(<PatientDetailClient {...props} initialTherapySessions={[session("t-1", "2026-09-14")]} />);
    expect(card("Patient:in löschen").textContent).toContain("Die einzige Therapiesitzung wird mitgelöscht");
    expect(card("Patient:in löschen").textContent).not.toMatch(/1 Therapiesitzungen|Sitzung\(en\)/);
    unmount();
    render(<PatientDetailClient {...props} initialTherapySessions={[]} />);
    expect(card("Patient:in löschen").textContent).toContain("Es sind keine Therapiesitzungen erfasst");
    expect(card("Patient:in löschen").textContent).not.toContain("Alle 0");
  });

  it("speichert den Antrag mit Enter im Feld; das Formular hat nur „Antrag speichern“ als Submit-Knopf (#51)", async () => {
    vi.mocked(updatePatient).mockResolvedValue({ success: false, error: "egal" });
    render(<PatientDetailClient {...props} />);
    const field = screen.getByLabelText("Beantragte Behandlungsstunden") as HTMLInputElement;
    expect(submitButtons(field.form!).map((b) => b.textContent)).toEqual(["Antrag speichern"]);
    expect(screen.getByRole("form", { name: "Antrag" })).toBe(field.form);
    fireEvent.change(field, { target: { value: "60" } });
    pressEnter(field);
    await waitFor(() => expect(updatePatient).toHaveBeenCalledWith(expect.objectContaining({ beantragteStunden: 60 })));
    expect(updatePatient).toHaveBeenCalledTimes(1);
  });

  describe("Chiffre bearbeiten (#74)", () => {
    const chiffreFeld = () => screen.getByLabelText("Chiffre") as HTMLInputElement;
    const detail = (chiffre: string) => ({
      patient: { ...patient, chiffre },
      therapySessions: props.initialTherapySessions,
      supervisionSessions: [],
      supervisors: [],
    });

    it("zeigt die Chiffre im Feld mit dem Hinweis auf Chiffren statt Klarnamen", () => {
      render(<PatientDetailClient {...props} />);
      expect(chiffreFeld().value).toBe("A-1");
      expect(card("Chiffre").textContent).toContain("Nur Chiffren, keine Klarnamen");
      expect(chiffreFeld().getAttribute("aria-describedby")).toBe("chiffre-hinweis");
      expect(document.getElementById("chiffre-hinweis")?.textContent).toContain("keine Klarnamen");
    });

    it("ist mobil gut bedienbar: keine Autokorrektur, kein Ausfüllvorschlag, höchstens 50 Zeichen", () => {
      render(<PatientDetailClient {...props} />);
      const feld = chiffreFeld();
      expect(feld.getAttribute("autocomplete")).toBe("off");
      expect(feld.getAttribute("autocorrect")).toBe("off");
      expect(feld.getAttribute("spellcheck")).toBe("false");
      expect(feld.getAttribute("enterkeyhint")).toBe("done");
      expect(feld.maxLength).toBe(50);
    });

    it("speichert die geänderte Chiffre ohne Leerzeichen am Rand und zeigt sie danach in der Überschrift", async () => {
      vi.mocked(renamePatient).mockResolvedValue({ success: true, data: detail("A-neu") });
      render(<PatientDetailClient {...props} />);
      fireEvent.change(chiffreFeld(), { target: { value: "  A-neu " } });
      fireEvent.click(screen.getByRole("button", { name: "Chiffre speichern" }));
      await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("A-neu"));
      expect(chiffreFeld().value).toBe("A-neu");
      // Nur ID und Chiffre: ein veralteter Tab schreibt beim Umbenennen keine Antrags- oder Statusfelder zurück.
      expect(renamePatient).toHaveBeenCalledWith({ id: P1, chiffre: "A-neu" });
      expect(updatePatient).not.toHaveBeenCalled();
    });

    it("speichert die Chiffre mit Enter; das Formular hat nur „Chiffre speichern“ als Submit-Knopf", async () => {
      vi.mocked(renamePatient).mockResolvedValue({ success: false, error: "egal" });
      render(<PatientDetailClient {...props} />);
      const feld = chiffreFeld();
      expect(submitButtons(feld.form!).map((b) => b.textContent)).toEqual(["Chiffre speichern"]);
      fireEvent.change(feld, { target: { value: "A-2" } });
      pressEnter(feld);
      await waitFor(() => expect(renamePatient).toHaveBeenCalledWith(expect.objectContaining({ chiffre: "A-2" })));
      expect(renamePatient).toHaveBeenCalledTimes(1);
    });

    it("zeigt eine schon vergebene Chiffre als Meldung am Feld und behält die alte Überschrift", async () => {
      vi.mocked(renamePatient).mockResolvedValue({
        success: false,
        error: MELDUNG_CHIFFRE_VERGEBEN,
        fieldErrors: { chiffre: [MELDUNG_CHIFFRE_VERGEBEN] },
      });
      render(<PatientDetailClient {...props} />);
      fireEvent.change(chiffreFeld(), { target: { value: "B-7" } });
      fireEvent.click(screen.getByRole("button", { name: "Chiffre speichern" }));
      await waitFor(() => expect(chiffreFeld().getAttribute("aria-invalid")).toBe("true"));
      expect(document.getElementById("chiffre-fehler")?.textContent).toBe(MELDUNG_CHIFFRE_VERGEBEN);
      expect(chiffreFeld().getAttribute("aria-describedby")).toBe("chiffre-fehler chiffre-hinweis");
      // Nur einmal, am Feld – nicht zusätzlich als Sammelmeldung „chiffre: …“.
      expect(card("Chiffre").textContent?.match(/schon vergeben/g)).toHaveLength(1);
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("A-1");
      expect(chiffreFeld().value).toBe("B-7");
    });

    it("nimmt die Meldung am Feld weg, sobald weitergetippt wird", async () => {
      vi.mocked(renamePatient).mockResolvedValue({
        success: false,
        error: MELDUNG_CHIFFRE_VERGEBEN,
        fieldErrors: { chiffre: [MELDUNG_CHIFFRE_VERGEBEN] },
      });
      render(<PatientDetailClient {...props} />);
      fireEvent.change(chiffreFeld(), { target: { value: "B-7" } });
      fireEvent.click(screen.getByRole("button", { name: "Chiffre speichern" }));
      await waitFor(() => expect(chiffreFeld().getAttribute("aria-invalid")).toBe("true"));
      fireEvent.change(chiffreFeld(), { target: { value: "B-8" } });
      expect(document.getElementById("chiffre-fehler")).toBeNull();
      expect(chiffreFeld().getAttribute("aria-invalid")).toBeNull();
      expect(chiffreFeld().getAttribute("aria-describedby")).toBe("chiffre-hinweis");
    });

    it("lässt beim Tippen in der Chiffre einen Fehler einer anderen Karte stehen", async () => {
      vi.mocked(updatePatient).mockResolvedValue({ success: false, error: "Antrag nicht gespeichert" });
      render(<PatientDetailClient {...props} />);
      fireEvent.click(screen.getByRole("button", { name: "Antrag speichern" }));
      await waitFor(() => expect(card("Antrag").contains(screen.getByRole("alert"))).toBe(true));
      fireEvent.change(chiffreFeld(), { target: { value: "A-2" } });
      expect(within(card("Antrag")).getByRole("alert").textContent).toContain("Antrag nicht gespeichert");
    });

    it("zeigt andere Fehler beim Speichern der Chiffre in der Chiffre-Karte", async () => {
      vi.mocked(renamePatient).mockResolvedValue({ success: false, error: "Patient:in nicht gefunden" });
      render(<PatientDetailClient {...props} />);
      fireEvent.change(chiffreFeld(), { target: { value: "A-2" } });
      fireEvent.click(screen.getByRole("button", { name: "Chiffre speichern" }));
      await waitFor(() => expect(card("Chiffre").contains(screen.getByRole("alert"))).toBe(true));
      expect(screen.getByRole("alert").textContent).toContain("Patient:in nicht gefunden");
    });

    it("lehnt eine leere Chiffre ohne Serveraufruf mit Meldung am Feld ab", () => {
      render(<PatientDetailClient {...props} />);
      fireEvent.change(chiffreFeld(), { target: { value: "   " } });
      fireEvent.click(screen.getByRole("button", { name: "Chiffre speichern" }));
      expect(document.getElementById("chiffre-fehler")?.textContent).toBe(MELDUNG_CHIFFRE_PFLICHT);
      expect(chiffreFeld().getAttribute("aria-invalid")).toBe("true");
      expect(renamePatient).not.toHaveBeenCalled();
    });

    it("kennzeichnet das Feld als Pflichtfeld", () => {
      render(<PatientDetailClient {...props} />);
      expect(chiffreFeld().required).toBe(true);
    });

    // Der Fokus springt aufs Feld, damit Screenreader Feld und Meldung (aria-describedby) gleich vorlesen.
    it("setzt bei einer vergebenen Chiffre den Fokus aufs Feld", async () => {
      vi.mocked(renamePatient).mockResolvedValue({
        success: false,
        error: MELDUNG_CHIFFRE_VERGEBEN,
        fieldErrors: { chiffre: [MELDUNG_CHIFFRE_VERGEBEN] },
      });
      render(<PatientDetailClient {...props} />);
      fireEvent.change(chiffreFeld(), { target: { value: "B-7" } });
      const knopf = screen.getByRole("button", { name: "Chiffre speichern" });
      knopf.focus();
      fireEvent.click(knopf);
      await waitFor(() => expect(document.activeElement).toBe(chiffreFeld()));
    });

    // Bei Enter bzw. „Fertig“ hat das Feld den Fokus schon; die Meldung muss dann selbst angesagt werden.
    it("sagt eine vergebene Chiffre nach Enter im Feld als Alert an", async () => {
      vi.mocked(renamePatient).mockResolvedValue({
        success: false,
        error: MELDUNG_CHIFFRE_VERGEBEN,
        fieldErrors: { chiffre: [MELDUNG_CHIFFRE_VERGEBEN] },
      });
      render(<PatientDetailClient {...props} />);
      const feld = chiffreFeld();
      feld.focus();
      fireEvent.change(feld, { target: { value: "B-7" } });
      pressEnter(feld);
      await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(MELDUNG_CHIFFRE_VERGEBEN));
      expect(screen.getByRole("alert").id).toBe("chiffre-fehler");
      expect(document.activeElement).toBe(chiffreFeld());
    });

    it("setzt bei einer leeren Chiffre den Fokus aufs Feld", async () => {
      render(<PatientDetailClient {...props} />);
      fireEvent.change(chiffreFeld(), { target: { value: "" } });
      const knopf = screen.getByRole("button", { name: "Chiffre speichern" });
      knopf.focus();
      fireEvent.click(knopf);
      await waitFor(() => expect(document.activeElement).toBe(chiffreFeld()));
    });

    it("übernimmt eine in einem anderen Tab geänderte Chiffre ins unbearbeitete Feld", async () => {
      vi.mocked(updatePatient).mockResolvedValue({ success: true, data: detail("A-anderer-tab") });
      render(<PatientDetailClient {...props} />);
      fireEvent.click(screen.getByRole("button", { name: "Antrag speichern" }));
      await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("A-anderer-tab"));
      expect(chiffreFeld().value).toBe("A-anderer-tab");
    });

    it("übernimmt die Chiffre aus einem anderen Tab auch nach dem Bearbeiten einer Sitzung", async () => {
      vi.mocked(updateTherapySession).mockResolvedValue({ success: true, data: detail("A-anderer-tab") });
      render(<PatientDetailClient {...props} />);
      fireEvent.click(screen.getAllByRole("button", { name: "Sitzung bearbeiten" })[0]);
      fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
      await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("A-anderer-tab"));
      expect(chiffreFeld().value).toBe("A-anderer-tab");
    });

    it("lässt einen ungespeicherten Chiffre-Entwurf stehen, wenn der Antrag gespeichert wird", async () => {
      vi.mocked(updatePatient).mockResolvedValue({ success: true, data: detail("A-anderer-tab") });
      render(<PatientDetailClient {...props} />);
      fireEvent.change(chiffreFeld(), { target: { value: "Entwurf" } });
      fireEvent.click(screen.getByRole("button", { name: "Antrag speichern" }));
      await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("A-anderer-tab"));
      expect(chiffreFeld().value).toBe("Entwurf");
    });

    it("schickt beim Speichern des Antrags keine Chiffre mit, auch keinen ungespeicherten Entwurf", async () => {
      vi.mocked(updatePatient).mockResolvedValue({ success: false, error: "egal" });
      render(<PatientDetailClient {...props} />);
      fireEvent.change(chiffreFeld(), { target: { value: "Entwurf" } });
      fireEvent.click(screen.getByRole("button", { name: "Antrag speichern" }));
      await waitFor(() => expect(updatePatient).toHaveBeenCalledTimes(1));
      expect(vi.mocked(updatePatient).mock.calls[0][0]).not.toHaveProperty("chiffre");
      expect(renamePatient).not.toHaveBeenCalled();
    });
  });
});
