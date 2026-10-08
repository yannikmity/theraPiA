import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { SupervisionSessionEditForm } from "../../app/(app)/supervision/SupervisionSessionEditForm";
import { newPatientId, newSupervisionSessionId, newSupervisorId, newTherapySessionId, type SupervisionSession, type Supervisor } from "@/types";

const supervisors: Supervisor[] = [{ id: newSupervisorId("s-1"), name: "Supervision Eins", costPerHour: 80, isActive: true }];
const session: SupervisionSession = {
  id: newSupervisionSessionId("sv-1"),
  supervisorId: newSupervisorId("s-1"),
  date: "2026-09-20",
  durationMinutes: 60,
  kind: "individual",
  setting: "einzel",
  linkedTherapySessionIds: [newTherapySessionId("t-1")],
  linkedGroupSessionIds: [],
  caseShares: [{ patientId: newPatientId("p-1"), minutes: 60 }],
};
const linkOptions = [
  { id: "t-1", label: "A-1 · 10.09.2026 · 50 Min", patientId: "p-1" },
  { id: "t-2", label: "A-2 · 12.09.2026 · 50 Min", patientId: "p-2" },
];
const chiffren: Record<string, string> = { "p-1": "A-1", "p-2": "A-2", "p-3": "A-3" };
const renderForm = (onSave = vi.fn(async () => {}), overrides: Partial<SupervisionSession> = {}) =>
  render(
    <SupervisionSessionEditForm
      session={{ ...session, ...overrides }}
      supervisors={supervisors}
      linkOptionsFor={() => linkOptions}
      caseLabel={(id) => chiffren[id]}
      saving={false}
      onSave={onSave}
      onCancel={() => {}}
    />
  );

describe("SupervisionSessionEditForm", () => {
  it("beschriftet die Zuordnungen als Gruppe (fieldset/legend) und schaltet sie um", () => {
    const onSave = vi.fn(async () => {});
    renderForm(onSave);
    const group = screen.getByRole("group", { name: "Besprochene Sitzungen" });
    const boxes = within(group).getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(boxes[0].getAttribute("aria-checked")).toBe("true");
    fireEvent.click(boxes[1]);
    fireEvent.change(screen.getByLabelText("A-2"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).toHaveBeenCalledWith({
      supervisorId: "s-1",
      date: "2026-09-20",
      durationMinutes: 90,
      setting: "einzel",
      linkedIds: ["t-1", "t-2"],
      caseShares: [
        { patientId: "p-1", minutes: 60 },
        { patientId: "p-2", minutes: 30 },
      ],
    });
  });

  // #40: Dauer je Patient:in statt Gesamtdauer, vorbelegt mit den gespeicherten Anteilen.
  it("belegt die Dauer je Patient:in mit dem gespeicherten Anteil vor und zeigt die Summe", () => {
    renderForm();
    expect(screen.queryByLabelText("Dauer gesamt (Minuten)")).toBeNull();
    expect((screen.getByLabelText("A-1") as HTMLInputElement).value).toBe("60");
    expect(screen.getByText("Gesamt: 60 Min")).toBeDefined();
  });

  it("verlangt eine Dauer für eine neu gewählte Patient:in", () => {
    const onSave = vi.fn(async () => {});
    renderForm(onSave);
    fireEvent.click(within(screen.getByRole("group", { name: "Besprochene Sitzungen" })).getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).not.toHaveBeenCalled();
    const field = screen.getByLabelText("A-2");
    expect(field.getAttribute("aria-describedby")).toBe(screen.getByText("Bitte eine Dauer angeben").id);
    expect(document.activeElement).toBe(field);
  });

  it("entfernt eine Patient:in samt Anteil, wenn ihre Sitzungen abgewählt werden", () => {
    const onSave = vi.fn(async () => {});
    renderForm(onSave, {
      durationMinutes: 50,
      linkedTherapySessionIds: [newTherapySessionId("t-1"), newTherapySessionId("t-2")],
      caseShares: [
        { patientId: newPatientId("p-1"), minutes: 25 },
        { patientId: newPatientId("p-2"), minutes: 25 },
      ],
    });
    fireEvent.click(within(screen.getByRole("group", { name: "Besprochene Sitzungen" })).getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ durationMinutes: 25, linkedIds: ["t-1"], caseShares: [{ patientId: "p-1", minutes: 25 }] })
    );
  });

  it("behält den Anteil einer Patient:in ohne verknüpfte Sitzung, bis er ausdrücklich entfernt wird", () => {
    const onSave = vi.fn(async () => {});
    renderForm(onSave, {
      durationMinutes: 50,
      caseShares: [
        { patientId: newPatientId("p-1"), minutes: 25 },
        { patientId: newPatientId("p-3"), minutes: 25 },
      ],
    });
    expect((screen.getByLabelText("A-3") as HTMLInputElement).value).toBe("25");
    fireEvent.click(screen.getByRole("button", { name: "A-3 entfernen" }));
    expect(screen.queryByLabelText("A-3")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ durationMinutes: 25, caseShares: [{ patientId: "p-1", minutes: 25 }] })
    );
  });

  it("nennt die Gruppe bei Gruppen-Supervision „Besprochene Doppelstunden“", () => {
    renderForm(undefined, { kind: "group", linkedTherapySessionIds: [], linkedGroupSessionIds: [] });
    expect(screen.getByRole("group", { name: "Besprochene Doppelstunden" })).toBeDefined();
  });

  it("meldet Dauer 0 am Feld und speichert nicht", () => {
    const onSave = vi.fn(async () => {});
    renderForm(onSave);
    const duration = screen.getByLabelText("A-1") as HTMLInputElement;
    fireEvent.change(duration, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(duration.getAttribute("aria-describedby")).toBe(screen.getByText("Dauer muss mindestens 1 Minute sein").id);
  });

  it("meldet Gesamtdauer 0 ohne Fälle am Feld und speichert nicht", () => {
    const onSave = vi.fn(async () => {});
    renderForm(onSave, { linkedTherapySessionIds: [], caseShares: [] });
    const duration = screen.getByLabelText("Dauer gesamt (Minuten)") as HTMLInputElement;
    fireEvent.change(duration, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(duration.getAttribute("aria-describedby")).toBe(screen.getByText("Dauer muss mindestens 1 Minute sein").id);
  });

  it("meldet ein geleertes Datum am Feld und speichert nicht", () => {
    const onSave = vi.fn(async () => {});
    renderForm(onSave);
    const date = screen.getByLabelText("Datum") as HTMLInputElement;
    fireEvent.change(date, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(date.getAttribute("aria-describedby")).toBe(screen.getByText("Bitte ein Datum angeben").id);
    expect(document.activeElement).toBe(date);
  });

  it("ändert das Setting und gibt es beim Speichern mit", async () => {
    const onSave = vi.fn(async () => {});
    render(<SupervisionSessionEditForm session={session} supervisors={supervisors} linkOptionsFor={() => []} saving={false} onSave={onSave} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText("Setting"), { target: { value: "gruppe" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ setting: "gruppe" })));
  });
});
