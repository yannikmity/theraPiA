import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("../../lib/analytics/track", () => ({ track: vi.fn(), trackFailure: vi.fn() }));
vi.mock("../../app/(app)/groups/[id]/actions", () => ({
  addGroupSession: vi.fn(),
  updateGroupSession: vi.fn(),
  deleteGroupSession: vi.fn(),
  addGroupSupervisionSession: vi.fn(),
}));

import { GroupDetailClient } from "../../app/(app)/groups/[id]/GroupDetailClient";
import { addGroupSupervisionSession, updateGroupSession } from "../../app/(app)/groups/[id]/actions";
import { newGroupId, newGroupSessionId, newSupervisorId, type Group, type GroupSession, type Supervisor } from "@/types";
import { resolveRegelwerk, standardRegelwerk } from "../../lib/ausbildungsregeln/resolve";

const group: Group = {
  id: newGroupId("g-1"),
  name: "Gruppe Beispiel",
  startDate: "2026-03-02",
  plannedSessionCount: 20,
  avgKids: 8,
  isActive: true,
  createdAt: "2026-03-02T08:00:00.000Z",
};
const groupSession = (id: string, date: string): GroupSession => ({
  id: newGroupSessionId(id),
  groupId: group.id,
  date,
  status: "durchgefuehrt",
  childCount: 8,
  countsTowardAmbulanzzeit: true,
  durationMinutes: 100,
  notes: "",
});
const supervisors: Supervisor[] = [{ id: newSupervisorId("s-1"), name: "Supervision Eins", costPerHour: 80, isActive: true }];
const props = {
  initialGroup: group,
  initialGroupSessions: [groupSession("gs-1", "2026-09-07"), groupSession("gs-2", "2026-09-14")],
  initialSupervisionSessions: [],
  initialSupervisedGroupSessionIds: [] as string[],
  initialSupervisors: supervisors,
  regelwerk: standardRegelwerk(),
};
// Zwei „Neu“-Knöpfe: Doppelstunde, Gruppen-Supervision.
const openSupervisionForm = () => fireEvent.click(screen.getAllByRole("button", { name: "Neu" })[1]);

describe("GroupDetailClient", () => {
  beforeEach(() => {
    vi.mocked(updateGroupSession).mockReset();
    vi.mocked(addGroupSupervisionSession).mockReset();
  });

  it("beschriftet die Doppelstunden-Zuordnung der Gruppen-Supervision als Gruppe (fieldset/legend)", () => {
    render(<GroupDetailClient {...props} />);
    openSupervisionForm();
    const fieldset = screen.getByRole("group", { name: "Besprochene Doppelstunden" });
    expect(within(fieldset).getAllByRole("checkbox")).toHaveLength(2);
  });

  it("bietet eine Doppelstunde, die eine Supervision einer anderen Gruppe bespricht, nicht erneut an (#47)", () => {
    render(<GroupDetailClient {...props} initialSupervisedGroupSessionIds={["gs-1"]} />);
    openSupervisionForm();
    const fieldset = screen.getByRole("group", { name: "Besprochene Doppelstunden" });
    const angeboten = within(fieldset).getAllByRole("checkbox");
    expect(angeboten).toHaveLength(1);
    expect(within(fieldset).getByText("14.09.2026")).toBeTruthy();
    expect(within(fieldset).queryByText("07.09.2026")).toBeNull();
  });

  it("zeigt einen abgelehnten Statuswechsel (Netz weg) in der Zeile der Doppelstunde", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(updateGroupSession).mockRejectedValue(new TypeError("Failed to fetch"));
    render(<GroupDetailClient {...props} />);
    const select = screen.getAllByLabelText("Status")[0];
    fireEvent.change(select, { target: { value: "ausgefallen" } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Ein unerwarteter Fehler ist aufgetreten"));
    const row = select.closest("[data-slot=native-select-wrapper]")!.parentElement as HTMLElement;
    expect(within(row).getByRole("alert")).toBeDefined();
    expect(logged).toHaveBeenCalledWith("Server-Action fehlgeschlagen:", expect.any(TypeError));
    logged.mockRestore();
  });

  it("meldet Dauer 0 der Gruppen-Supervision am Feld und ruft die Action nicht auf", () => {
    render(<GroupDetailClient {...props} />);
    openSupervisionForm();
    const duration = screen.getByLabelText("Dauer (Min)") as HTMLInputElement;
    fireEvent.change(duration, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(addGroupSupervisionSession).not.toHaveBeenCalled();
    expect(duration.getAttribute("aria-invalid")).toBe("true");
    expect(duration.getAttribute("aria-describedby")).toBe(screen.getByText("Dauer muss mindestens 1 Minute sein").id);
  });

  it("setzt bei ungültiger Dauer der Gruppen-Supervision den Fokus ins Feld", () => {
    render(<GroupDetailClient {...props} />);
    openSupervisionForm();
    const duration = screen.getByLabelText("Dauer (Min)") as HTMLInputElement;
    fireEvent.change(duration, { target: { value: "0" } });
    const save = screen.getByRole("button", { name: "Speichern" });
    save.focus();
    fireEvent.click(save);
    expect(document.activeElement).toBe(duration);
  });

  it("zeigt einen abgelehnten Speichern-Aufruf der Gruppen-Supervision (Netz weg) im Formular", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(addGroupSupervisionSession).mockRejectedValue(new TypeError("Failed to fetch"));
    render(<GroupDetailClient {...props} />);
    openSupervisionForm();
    const save = screen.getByRole("button", { name: "Speichern" });
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Ein unerwarteter Fehler ist aufgetreten"));
    expect(save.previousElementSibling?.getAttribute("role")).toBe("alert");
    expect(logged).toHaveBeenCalledWith("Server-Action fehlgeschlagen:", expect.any(TypeError));
    logged.mockRestore();
  });

  it("zeigt die Gruppenziele aus dem Regelwerk", () => {
    const regelwerk = resolveRegelwerk({
      instanz: { ...standardRegelwerk().regeln, gruppeDoppelstundenZiel: 50, gruppeAmbulanzzeitZiel: 30 },
      abweichungen: null,
      ebmStaffeln: [],
    });
    render(<GroupDetailClient {...props} regelwerk={regelwerk} />);
    expect(screen.getByRole("progressbar", { name: "Doppelstunden gesamt" }).getAttribute("aria-valuemax")).toBe("50");
    expect(screen.getByRole("progressbar", { name: "davon Ambulanzzeit" }).getAttribute("aria-valuemax")).toBe("30");
  });

  it("zeigt im Formular das Honorar der Staffel am gewählten Datum", () => {
    const regelwerk = resolveRegelwerk({
      instanz: null,
      abweichungen: null,
      ebmStaffeln: [
        { id: "alt", gueltigAb: "2000-01-01", stufen: [{ kinderzahl: 3, total: 100, share: 50 }] },
        { id: "neu", gueltigAb: "2026-01-01", stufen: [{ kinderzahl: 3, total: 110, share: 55 }] },
      ],
    });
    render(<GroupDetailClient {...props} regelwerk={regelwerk} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Neu" })[0]);
    const datum = document.getElementById("gs-date") as HTMLInputElement;
    fireEvent.change(datum, { target: { value: "2025-12-31" } });
    expect(screen.getByText("Honorar-Anteil: 50 EUR")).toBeDefined();
    fireEvent.change(datum, { target: { value: "2026-01-02" } });
    expect(screen.getByText("Honorar-Anteil: 55 EUR")).toBeDefined();
  });

  it("zeigt nach dem Leeren der Dauer ein leeres Feld (nicht „0“) und meldet „Bitte eine Dauer angeben“", () => {
    render(<GroupDetailClient {...props} />);
    openSupervisionForm();
    const duration = screen.getByLabelText("Dauer (Min)") as HTMLInputElement;
    fireEvent.change(duration, { target: { value: "" } });
    expect(duration.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(addGroupSupervisionSession).not.toHaveBeenCalled();
    expect(duration.getAttribute("aria-describedby")).toBe(screen.getByText("Bitte eine Dauer angeben").id);
  });
});
