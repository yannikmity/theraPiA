import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("../../lib/analytics/track", () => ({ track: vi.fn(), trackFailure: vi.fn() }));
vi.mock("../../app/(app)/supervision/actions", () => ({
  updateSupervisionSessionAction: vi.fn(),
  deleteSupervisionSessionAction: vi.fn(),
}));

import { SupervisionClient } from "../../app/(app)/supervision/SupervisionClient";
import {
  deleteSupervisionSessionAction,
  updateSupervisionSessionAction,
  type SupervisionData,
} from "../../app/(app)/supervision/actions";
import { newPatientId, newSupervisionSessionId, newSupervisorId, newTherapySessionId } from "@/types";

const data = (linked: string[]): SupervisionData => ({
  supervisionSessions: [
    {
      id: newSupervisionSessionId("sv-1"),
      supervisorId: newSupervisorId("s-1"),
      date: "2026-09-20",
      durationMinutes: 60,
      kind: "individual",
      setting: "einzel",
      linkedTherapySessionIds: linked.map(newTherapySessionId),
      linkedGroupSessionIds: [],
      groupId: null,
      caseShares: linked.length > 0 ? [{ patientId: newPatientId("p-1"), minutes: 60 }] : [],
    },
  ],
  supervisors: [{ id: newSupervisorId("s-1"), name: "Supervision Eins", costPerHour: 80, isActive: true }],
  patients: [
    {
      id: newPatientId("p-1"),
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
    },
  ],
  therapySessions: ["t-1", "t-2"].map((id, i) => ({
    id: newTherapySessionId(id),
    patientId: newPatientId("p-1"),
    date: `2026-09-1${i}`,
    durationMinutes: 50,
    notes: "",
    category: "behandlung" as const,
  })),
  groups: [],
  groupSessions: [],
});

describe("SupervisionClient", () => {
  beforeEach(() => {
    vi.mocked(deleteSupervisionSessionAction).mockReset();
    vi.mocked(updateSupervisionSessionAction).mockReset();
  });

  it("bietet im Seitenkopf „Supervision erfassen“ an – Sprung in die Erfassung mit Supervision vorgewählt", () => {
    render(<SupervisionClient initialData={data([])} />);
    const link = screen.getByRole("link", { name: "Supervision erfassen" });
    expect(link.getAttribute("href")).toBe("/sessions/new?type=supervision");
    expect(link.textContent).toBe("Supervision");
  });

  it("hält „SV-Einheiten“ im Untertitel zusammen", () => {
    render(<SupervisionClient initialData={data([])} />);
    const units = screen.getByText("1,2 SV-Einheiten");
    expect(units.className).toContain("whitespace-nowrap");
    expect(units.parentElement?.textContent).toBe("1 Supervisionen · 1,2 SV-Einheiten");
  });

  it("formuliert die Nachfrage beim Löschen ohne „Zuordnung(en)“", () => {
    const { unmount } = render(<SupervisionClient initialData={data(["t-1"])} />);
    fireEvent.click(screen.getByRole("button", { name: "Supervision löschen" }));
    expect(screen.getByText("Die Zuordnung wird entfernt, die Sitzung selbst bleibt bestehen.")).toBeDefined();
    unmount();
    render(<SupervisionClient initialData={data(["t-1", "t-2"])} />);
    fireEvent.click(screen.getByRole("button", { name: "Supervision löschen" }));
    expect(screen.getByText("2 Zuordnungen werden entfernt, die Sitzungen selbst bleiben bestehen.")).toBeDefined();
  });

  it("zeigt einen abgelehnten Löschaufruf (Netz weg) in der Zeile der Supervision", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(deleteSupervisionSessionAction).mockRejectedValue(new TypeError("Failed to fetch"));
    render(<SupervisionClient initialData={data(["t-1"])} />);
    fireEvent.click(screen.getByRole("button", { name: "Supervision löschen" }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, löschen" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Ein unerwarteter Fehler ist aufgetreten"));
    const row = screen.getByRole("button", { name: "Supervision löschen" }).parentElement as HTMLElement;
    expect(within(row).getByRole("alert")).toBeDefined();
    expect(logged).toHaveBeenCalledWith("Server-Action fehlgeschlagen:", expect.any(TypeError));
    logged.mockRestore();
  });

  it("zeigt einen abgelehnten Speichern-Aufruf unter dem Bearbeiten-Formular und räumt ihn beim Abbrechen weg", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(updateSupervisionSessionAction).mockRejectedValue(new TypeError("Failed to fetch"));
    render(<SupervisionClient initialData={data(["t-1"])} />);
    fireEvent.click(screen.getByRole("button", { name: "Supervision bearbeiten" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Ein unerwarteter Fehler ist aufgetreten"));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(logged).toHaveBeenCalledWith("Server-Action fehlgeschlagen:", expect.any(TypeError));
    logged.mockRestore();
  });

  it("speichert ein geändertes Setting mit", async () => {
    vi.mocked(updateSupervisionSessionAction).mockResolvedValue({ success: true, data: data(["t-1"]) });
    render(<SupervisionClient initialData={data(["t-1"])} />);
    fireEvent.click(screen.getByRole("button", { name: "Supervision bearbeiten" }));
    fireEvent.change(screen.getByLabelText("Setting"), { target: { value: "gruppe" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(updateSupervisionSessionAction).toHaveBeenCalledWith(expect.objectContaining({ id: "sv-1", kind: "individual", setting: "gruppe" }))
    );
  });

  it("bietet beim Bearbeiten die Sitzungen bis zum eingegebenen Datum an, eigene Zuordnungen immer", () => {
    const d = data(["t-1"]);
    d.therapySessions.push({
      id: newTherapySessionId("t-3"),
      patientId: newPatientId("p-1"),
      date: "2026-09-25",
      durationMinutes: 50,
      notes: "",
      category: "behandlung",
    });
    render(<SupervisionClient initialData={d} />);
    fireEvent.click(screen.getByRole("button", { name: "Supervision bearbeiten" }));
    const labels = () =>
      within(screen.getByRole("group", { name: "Besprochene Sitzungen" }))
        .getAllByRole("checkbox")
        .map((box) => box.parentElement?.textContent ?? "");
    expect(labels()).toEqual(["A-1 · 11.09.2026 · 50 Min", "A-1 · 10.09.2026 · 50 Min"]);
    const date = screen.getByLabelText("Datum");
    fireEvent.change(date, { target: { value: "2026-09-10" } });
    expect(labels()).toEqual(["A-1 · 10.09.2026 · 50 Min"]);
    fireEvent.change(date, { target: { value: "2026-09-30" } });
    expect(labels()).toEqual(["A-1 · 25.09.2026 · 50 Min", "A-1 · 11.09.2026 · 50 Min", "A-1 · 10.09.2026 · 50 Min"]);
  });

  it("nennt in der Liste neben der Art das Setting", () => {
    render(<SupervisionClient initialData={data(["t-1"])} />);
    expect(screen.getByText(/Einzeltherapie · Einzel · 1 zugeordnet/)).toBeDefined();
  });
});
