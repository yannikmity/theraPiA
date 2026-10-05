import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
// Echtes next/navigation (runAction nutzt unstable_rethrow), nur der Router ist gemockt.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push, refresh }),
}));
vi.mock("../../lib/analytics/track", () => ({ track: vi.fn(), trackFailure: vi.fn() }));
vi.mock("../../app/(app)/sessions/new/actions", () => ({
  addTherapySession: vi.fn(),
  addTherapySessions: vi.fn(),
  addSupervisionSession: vi.fn(),
}));

import { NewSessionClient } from "../../app/(app)/sessions/new/NewSessionClient";
import { addSupervisionSession, addTherapySession, addTherapySessions } from "../../app/(app)/sessions/new/actions";
import { track } from "../../lib/analytics/track";
import type { LastWeekSuggestion } from "../../lib/quick-capture";
import { newPatientId, newSupervisorId, newTherapySessionId, type Patient, type Supervisor, type TherapySession } from "@/types";

const P1 = "550e8400-e29b-41d4-a716-446655440001";
const P2 = "550e8400-e29b-41d4-a716-446655440002";
const S1 = "550e8400-e29b-41d4-a716-446655440011";

const patient = (id: string, chiffre: string): Patient => ({
  id: newPatientId(id),
  chiffre,
  therapyType: "langzeittherapie",
  startDate: "2026-01-05",
  endDate: null,
  isActive: true,
  createdAt: "2026-01-05T08:00:00.000Z",
  antragsdatum: null,
  beantragteStunden: null,
  genehmigungsdatum: null,
  sprechstundenAmbulanz: 0,
});
const patients = [patient(P1, "A-1"), patient(P2, "A-2")];
const supervisors: Supervisor[] = [{ id: newSupervisorId(S1), name: "Supervision Eins", costPerHour: null, isActive: true }];
const suggestions: LastWeekSuggestion[] = [
  { sourceSessionId: newTherapySessionId("t-1"), patientId: newPatientId(P1), chiffre: "A-1", sourceDate: "2026-09-14", date: "2026-09-21", durationMinutes: 50, category: "behandlung" },
  { sourceSessionId: newTherapySessionId("t-2"), patientId: newPatientId(P2), chiffre: "A-2", sourceDate: "2026-09-16", date: "2026-09-23", durationMinutes: 60, category: "probatorik" },
];
const unsupervised: TherapySession[] = [
  { id: newTherapySessionId("t-9"), patientId: newPatientId(P1), date: "2026-09-10", durationMinutes: 50, notes: "", category: "behandlung" },
];
const props = {
  initialPatients: patients,
  initialSupervisors: supervisors,
  initialUnsupervisedSessions: unsupervised,
  today: "2026-09-27",
  initialType: "therapie" as const,
  initialPatientId: P2,
  categoryByPatient: { [P1]: "behandlung" as const, [P2]: "probatorik" as const },
  suggestions,
};

// Radix rendert die Chips einer ToggleGroup type="single" als role="radio" mit aria-checked.
const chip = (name: string) => screen.getByRole("radio", { name });
const checked = (name: string) => chip(name).getAttribute("aria-checked") === "true";

describe("NewSessionClient", () => {
  beforeEach(() => {
    vi.mocked(addTherapySession).mockReset();
    vi.mocked(addTherapySessions).mockReset();
    vi.mocked(addSupervisionSession).mockReset();
    vi.mocked(track).mockReset();
    push.mockReset();
    refresh.mockReset();
  });

  it("belegt Datum, Patient:in, Kategorie und Dauer vor – die Kategorie folgt der Patient:in", () => {
    render(<NewSessionClient {...props} />);
    expect((screen.getByLabelText("Datum") as HTMLInputElement).value).toBe("2026-09-27");
    expect((screen.getByLabelText("Patient:in (Chiffre)") as HTMLSelectElement).value).toBe(P2);
    expect(checked("Probatorik")).toBe(true);
    expect(checked("50 Min")).toBe(true);
    fireEvent.change(screen.getByLabelText("Patient:in (Chiffre)"), { target: { value: P1 } });
    expect(checked("Behandlung")).toBe(true);
  });

  it("speichert mit einem Tipp und bietet danach „Weitere Stunde erfassen“ statt umzuleiten", async () => {
    vi.mocked(addTherapySession).mockResolvedValue({ success: true, data: undefined });
    render(<NewSessionClient {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(addTherapySession).toHaveBeenCalledWith({ patientId: P2, date: "2026-09-27", durationMinutes: 50, notes: "", category: "probatorik" })
    );
    expect((await screen.findByRole("status")).textContent).toContain("Gespeichert!");
    expect(track).toHaveBeenCalledWith("therapy_session_saved", { mode: "new" });
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Weitere Stunde erfassen" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText("Patient:in (Chiffre)") as HTMLSelectElement).value).toBe(P2);
    expect(screen.getByRole("link", { name: /Zum Dashboard/ })).toBeDefined();
  });

  it("Weitere Stunde erfassen nach Einzelspeichern bei offener Liste: Liste zu, kein veralteter Zähler, keine alte Meldung", async () => {
    vi.mocked(addTherapySessions).mockResolvedValue({ success: true, data: { saved: 1, skipped: 0 } });
    vi.mocked(addTherapySession).mockResolvedValue({ success: true, data: undefined });
    const { rerender } = render(<NewSessionClient {...props} />);
    // Erst ein Stapel (Erfolgsmeldung), dann die Liste erneut öffnen und stattdessen eine einzelne Stunde speichern.
    fireEvent.click(screen.getByRole("button", { name: "Wie letzte Woche: 2 Sitzungen übernehmen" }));
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: "1 Sitzung speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("1 Sitzung gespeichert.");
    // Nach refresh() liefert der Server nur noch den übrigen Vorschlag.
    rerender(<NewSessionClient {...props} suggestions={[suggestions[1]]} />);
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    fireEvent.click(await screen.findByRole("button", { name: "Weitere Stunde erfassen" }));
    expect(addTherapySessions).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Wie letzte Woche: 1 Sitzung übernehmen" })).toBeDefined();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Sitzungen? speichern/ })).toBeNull();
  });

  it("Weitere Stunde erfassen schließt eine offene Vorschlagsliste – der Zähler zählt nur, was der Server noch liefert", async () => {
    vi.mocked(addTherapySession).mockResolvedValue({ success: true, data: undefined });
    const { rerender } = render(<NewSessionClient {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Wie letzte Woche: 2 Sitzungen übernehmen" }));
    expect(screen.getByRole("button", { name: "2 Sitzungen speichern" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    fireEvent.click(await screen.findByRole("button", { name: "Weitere Stunde erfassen" }));
    // Die einzelne Stunde deckt einen Vorschlag ab; nach refresh() bleibt nur einer übrig.
    rerender(<NewSessionClient {...props} suggestions={[suggestions[1]]} />);
    expect(screen.queryByRole("button", { name: "2 Sitzungen speichern" })).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Wie letzte Woche: 1 Sitzung übernehmen" })).toBeDefined();
    expect(addTherapySessions).not.toHaveBeenCalled();
  });

  it("hält die Notiz eingeklappt, bis sie gebraucht wird", () => {
    render(<NewSessionClient {...props} />);
    expect(screen.queryByLabelText("Notiz (optional)")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Notiz hinzufügen" }));
    expect(screen.getByLabelText("Notiz (optional)")).toBeDefined();
  });

  it("Wie letzte Woche: erst prüfen, dann speichern – nie ohne Knopf", async () => {
    vi.mocked(addTherapySessions).mockResolvedValue({ success: true, data: { saved: 1, skipped: 0 } });
    render(<NewSessionClient {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Wie letzte Woche: 2 Sitzungen übernehmen" }));
    expect(addTherapySessions).not.toHaveBeenCalled();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => b.getAttribute("aria-checked") === "true")).toBe(true);
    expect(screen.getByText("Mo, 21.09.2026")).toBeDefined();
    // Zeilen stehen nach Zieldatum: [0] = A-1 am 21.09., [1] = A-2 am 23.09. (Name-Abfrage über das umgebende
    // <label> ist bei Radix-Checkboxen in jsdom nicht verlässlich – deshalb über den Index).
    fireEvent.click(boxes[1]);
    fireEvent.click(screen.getByRole("button", { name: "1 Sitzung speichern" }));
    await waitFor(() =>
      expect(addTherapySessions).toHaveBeenCalledWith({
        sessions: [{ patientId: P1, date: "2026-09-21", durationMinutes: 50, notes: "", category: "behandlung" }],
      })
    );
    expect((await screen.findByRole("alert")).textContent).toContain("1 Sitzung gespeichert.");
    expect(track).toHaveBeenCalledWith("last_week_suggestions_applied", { count: 1 });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Wie letzte Woche/ })).toBeNull();
  });

  it("meldet übersprungene Doppelte und lässt sich abbrechen", async () => {
    vi.mocked(addTherapySessions).mockResolvedValue({ success: true, data: { saved: 1, skipped: 1 } });
    render(<NewSessionClient {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Wie letzte Woche/ }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /Wie letzte Woche/ }));
    fireEvent.click(screen.getByRole("button", { name: "2 Sitzungen speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("1 Sitzung gespeichert, 1 übersprungen (gab es schon).");
  });

  it("Supervision bleibt erreichbar – auch per Adresse vorgewählt, ohne Vorschläge, mit 50 Minuten", () => {
    render(<NewSessionClient {...props} initialType="supervision" />);
    expect((screen.getByLabelText("Supervisor:in") as HTMLSelectElement).value).toBe(S1);
    expect(checked("50 Min")).toBe(true);
    expect(screen.getByText("Besprochene Sitzungen zuordnen")).toBeDefined();
    expect(screen.queryByRole("button", { name: /Wie letzte Woche/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Notiz hinzufügen" })).toBeNull();
  });

  // Zusätzlich zum Plan: Doppeltipp-Schutz und unveränderte Supervisions-Erfassung (Pilot-Anforderungen).
  it("sperrt Speichern, solange gespeichert wird – ein Doppeltipp speichert nur einmal", async () => {
    let resolve: (value: { success: true; data: undefined }) => void = () => {};
    vi.mocked(addTherapySession).mockReturnValue(new Promise((r) => (resolve = r)));
    render(<NewSessionClient {...props} />);
    const save = screen.getByRole("button", { name: "Speichern" }) as HTMLButtonElement;
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(save.disabled).toBe(true));
    fireEvent.click(save);
    expect(addTherapySession).toHaveBeenCalledTimes(1);
    resolve({ success: true, data: undefined });
    expect((await screen.findByRole("status")).textContent).toContain("Gespeichert!");
    expect(screen.getByRole("link", { name: /Zum Dashboard/ }).getAttribute("href")).toBe("/");
    expect(addTherapySession).toHaveBeenCalledTimes(1);
  });

  it("Wie letzte Woche: Knopf während des Speicherns gesperrt, Doppeltipp speichert den Stapel nur einmal", async () => {
    let resolve: (value: { success: true; data: { saved: number; skipped: number } }) => void = () => {};
    vi.mocked(addTherapySessions).mockReturnValue(new Promise((r) => (resolve = r)));
    render(<NewSessionClient {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Wie letzte Woche/ }));
    const confirm = screen.getByRole("button", { name: "2 Sitzungen speichern" }) as HTMLButtonElement;
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm.disabled).toBe(true));
    expect((screen.getByRole("button", { name: "Abbrechen" }) as HTMLButtonElement).disabled).toBe(true);
    expect(addTherapySessions).toHaveBeenCalledTimes(1);
    resolve({ success: true, data: { saved: 2, skipped: 0 } });
    expect((await screen.findByRole("alert")).textContent).toContain("2 Sitzungen gespeichert.");
    expect(track).toHaveBeenCalledWith("last_week_suggestions_applied", { count: 2 });
    expect(addTherapySessions).toHaveBeenCalledTimes(1);
  });

  it("Wie letzte Woche: ohne Auswahl kein Speichern", () => {
    render(<NewSessionClient {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Wie letzte Woche/ }));
    for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
    const confirm = screen.getByRole("button", { name: "0 Sitzungen speichern" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(addTherapySessions).not.toHaveBeenCalled();
  });

  it("Wie letzte Woche: nach Abbrechen und erneutem Aufklappen steht die alte Stapel-Meldung nicht mehr da", async () => {
    vi.mocked(addTherapySessions).mockResolvedValue({ success: false, error: "Ungültige Eingabe" });
    render(<NewSessionClient {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Wie letzte Woche/ }));
    fireEvent.click(screen.getByRole("button", { name: "2 Sitzungen speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Ungültige Eingabe");
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    fireEvent.click(screen.getByRole("button", { name: /Wie letzte Woche/ }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Wie letzte Woche: Auf- und Zuklappen lässt eine Meldung am Speichern-Knopf stehen", async () => {
    vi.mocked(addTherapySession).mockResolvedValue({ success: false, error: "Patient:in nicht gefunden" });
    render(<NewSessionClient {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Patient:in nicht gefunden");
    fireEvent.click(screen.getByRole("button", { name: /Wie letzte Woche/ }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.getByRole("alert").textContent).toContain("Patient:in nicht gefunden");
  });

  it("Supervision speichert mit zugeordneten Sitzungen wie bisher", async () => {
    vi.mocked(addSupervisionSession).mockResolvedValue({ success: true, data: undefined });
    render(<NewSessionClient {...props} />);
    fireEvent.click(chip("Supervision"));
    expect(checked("50 Min")).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(addSupervisionSession).toHaveBeenCalledWith({
        supervisorId: S1,
        date: "2026-09-27",
        durationMinutes: 50,
        kind: "individual",
        setting: "einzel",
        linkedTherapySessionIds: ["t-9"],
        linkedGroupSessionIds: [],
      })
    );
    expect((await screen.findByRole("status")).textContent).toContain("Gespeichert!");
    expect(track).toHaveBeenCalledWith("supervision_saved", { mode: "new", kind: "individual" });
    expect(addTherapySession).not.toHaveBeenCalled();
    expect(addTherapySessions).not.toHaveBeenCalled();
  });

  it("beschriftet die Zuordnungsliste der Supervision als Gruppe (fieldset/legend)", () => {
    render(<NewSessionClient {...props} initialType="supervision" />);
    const group = screen.getByRole("group", { name: "Besprochene Sitzungen zuordnen" });
    expect(within(group).getAllByRole("checkbox")).toHaveLength(1);
  });

  it("meldet Dauer 0 bei „Andere“ am Feld und ruft die Action nicht auf", () => {
    render(<NewSessionClient {...props} />);
    fireEvent.click(chip("Andere"));
    const field = screen.getByLabelText("Dauer in Minuten") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(addTherapySession).not.toHaveBeenCalled();
    const message = screen.getByText("Dauer muss mindestens 1 Minute sein");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")).toBe(message.id);
    fireEvent.change(field, { target: { value: "45" } });
    expect(screen.queryByText("Dauer muss mindestens 1 Minute sein")).toBeNull();
  });

  it("setzt bei ungültiger freier Dauer den Fokus ins Feld", () => {
    render(<NewSessionClient {...props} />);
    fireEvent.click(chip("Andere"));
    const field = screen.getByLabelText("Dauer in Minuten") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "0" } });
    const save = screen.getByRole("button", { name: "Speichern" });
    save.focus();
    fireEvent.click(save);
    expect(document.activeElement).toBe(field);
  });

  it("verwirft die Dauer-Meldung beim Wechsel auf eine vorgegebene Dauer", () => {
    render(<NewSessionClient {...props} />);
    fireEvent.click(chip("Andere"));
    fireEvent.change(screen.getByLabelText("Dauer in Minuten"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(screen.getByText("Dauer muss mindestens 1 Minute sein")).toBeDefined();
    fireEvent.click(chip("50 Min"));
    fireEvent.click(chip("Andere"));
    expect(screen.queryByText("Dauer muss mindestens 1 Minute sein")).toBeNull();
  });

  it("zeigt einen abgelehnten Aufruf (Netz weg) als Meldung unmittelbar vor dem Speichern-Knopf", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(addTherapySession).mockRejectedValue(new TypeError("Failed to fetch"));
    render(<NewSessionClient {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Ein unerwarteter Fehler ist aufgetreten");
    expect(alert.nextElementSibling).toBe(screen.getByRole("button", { name: "Speichern" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(logged).toHaveBeenCalledWith("Server-Action fehlgeschlagen:", expect.any(TypeError));
    logged.mockRestore();
  });

  it("zeigt einen Fehler beim Stapel-Speichern in der Karte „Wie letzte Woche“", async () => {
    vi.mocked(addTherapySessions).mockResolvedValue({ success: false, error: "Ungültige Eingabe" });
    render(<NewSessionClient {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Wie letzte Woche/ }));
    fireEvent.click(screen.getByRole("button", { name: "2 Sitzungen speichern" }));
    const alert = await screen.findByRole("alert");
    expect(screen.getByRole("region", { name: "Wie letzte Woche" }).contains(alert)).toBe(true);
  });

  it("meldet ein geleertes freies Dauerfeld mit „Bitte eine Dauer angeben“ – das Feld bleibt leer statt „0“", () => {
    render(<NewSessionClient {...props} />);
    fireEvent.click(chip("Andere"));
    const field = screen.getByLabelText("Dauer in Minuten") as HTMLInputElement;
    expect(field.value).toBe("50");
    fireEvent.change(field, { target: { value: "" } });
    expect(field.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(addTherapySession).not.toHaveBeenCalled();
    expect(field.getAttribute("aria-describedby")).toBe(screen.getByText("Bitte eine Dauer angeben").id);
    expect(screen.queryByText("Dauer muss mindestens 1 Minute sein")).toBeNull();
  });

  it("speichert eine freie Dauer mit genau diesem Wert", async () => {
    vi.mocked(addTherapySession).mockResolvedValue({ success: true, data: undefined });
    render(<NewSessionClient {...props} />);
    fireEvent.click(chip("Andere"));
    fireEvent.change(screen.getByLabelText("Dauer in Minuten"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(addTherapySession).toHaveBeenCalledWith(expect.objectContaining({ durationMinutes: 45 })));
  });

  it("bietet die Dauer in 25-Minuten-Schritten an, ohne 60 Min (#64)", () => {
    render(<NewSessionClient {...props} />);
    const labels = screen.getAllByRole("radio").map((r) => r.textContent);
    expect(labels).toEqual(expect.arrayContaining(["25 Min", "50 Min", "75 Min", "100 Min", "Andere"]));
    expect(screen.queryByRole("radio", { name: "60 Min" })).toBeNull();
    expect(checked("50 Min")).toBe(true);
  });

  it("speichert eine 25-Minuten-Sitzung über die Schnellauswahl", async () => {
    vi.mocked(addTherapySession).mockResolvedValue({ success: true, data: undefined });
    render(<NewSessionClient {...props} />);
    fireEvent.click(chip("25 Min"));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(addTherapySession).toHaveBeenCalledWith(expect.objectContaining({ durationMinutes: 25 })));
  });

  it("bietet alle fünf Kategorien in fester Reihenfolge an (#66)", () => {
    render(<NewSessionClient {...props} />);
    // Radix ToggleGroup rendert ohne role="group"; der Container trägt aria-label="Kategorie".
    const gruppe = screen.getByLabelText("Kategorie");
    expect(within(gruppe).getAllByRole("radio").map((r) => r.textContent)).toEqual([
      "Sprechstunde", "Probatorik", "Behandlung", "Bezugsperson", "Gesprächsziffer",
    ]);
  });

  it("Gesprächsziffer: Dauer in 10-Minuten-Schritten, zurück bei anderer Kategorie", () => {
    render(<NewSessionClient {...props} />);
    fireEvent.click(chip("Gesprächsziffer"));
    expect(checked("10 Min")).toBe(true);
    expect(screen.queryByRole("radio", { name: "25 Min" })).toBeNull();
    fireEvent.click(chip("Behandlung"));
    expect(checked("50 Min")).toBe(true);
  });

  it("bricht Kategorie- und sechs Dauer-Chips explizit auf drei pro Zeile um, ohne flex-1 (#66)", () => {
    render(<NewSessionClient {...props} />);
    for (const r of within(screen.getByLabelText("Kategorie")).getAllByRole("radio")) {
      expect(r.className).toContain("flex-[1_1_calc(33.333%-0.25rem)]");
      expect(r.className.split(" ")).not.toContain("flex-1");
    }
    expect(chip("50 Min").className.split(" ")).toContain("flex-1");
    fireEvent.click(chip("Gesprächsziffer"));
    for (const r of within(screen.getByLabelText("Dauer")).getAllByRole("radio")) {
      expect(r.className).toContain("flex-[1_1_calc(33.333%-0.5rem)]");
      expect(r.className.split(" ")).not.toContain("flex-1");
    }
  });

  it("behält eine freie Dauer („Andere“) beim Kategoriewechsel und speichert sie so", async () => {
    vi.mocked(addTherapySession).mockResolvedValue({ success: true, data: undefined });
    render(<NewSessionClient {...props} />);
    fireEvent.click(chip("Andere"));
    fireEvent.change(screen.getByLabelText("Dauer in Minuten"), { target: { value: "45" } });
    fireEvent.click(chip("Gesprächsziffer"));
    fireEvent.click(chip("Behandlung"));
    fireEvent.click(chip("Gesprächsziffer"));
    expect(checked("Andere")).toBe(true);
    expect((screen.getByLabelText("Dauer in Minuten") as HTMLInputElement).value).toBe("45");
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(addTherapySession).toHaveBeenCalledWith(expect.objectContaining({ category: "gespraechsziffer", durationMinutes: 45 }))
    );
  });

  it("wählt bei einer Patient:in mit zuletzt Gesprächsziffer die Kategorie und 10 Min vor", () => {
    const P3 = "550e8400-e29b-41d4-a716-446655440003";
    render(
      <NewSessionClient
        {...props}
        initialPatients={[...patients, patient(P3, "A-3")]}
        categoryByPatient={{ ...props.categoryByPatient, [P3]: "gespraechsziffer" }}
      />
    );
    fireEvent.change(screen.getByLabelText("Patient:in (Chiffre)"), { target: { value: P3 } });
    expect(checked("Gesprächsziffer")).toBe(true);
    expect(checked("10 Min")).toBe(true);
  });

  it("speichert eine Sprechstunde mit 25 Minuten", async () => {
    vi.mocked(addTherapySession).mockResolvedValue({ success: true, data: undefined });
    render(<NewSessionClient {...props} />);
    fireEvent.click(chip("Sprechstunde"));
    fireEvent.click(chip("25 Min"));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(addTherapySession).toHaveBeenCalledWith(expect.objectContaining({ category: "sprechstunde", durationMinutes: 25 }))
    );
  });
});
