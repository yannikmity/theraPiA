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
  groupId: null,
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

  it("blendet „Entfernen“ aus, sobald für den Fall wieder eine Sitzung angehakt ist", () => {
    renderForm(undefined, {
      durationMinutes: 50,
      caseShares: [
        { patientId: newPatientId("p-1"), minutes: 25 },
        { patientId: newPatientId("p-2"), minutes: 25 },
      ],
    });
    expect(screen.getByRole("button", { name: "A-2 entfernen" })).toBeDefined();
    fireEvent.click(within(screen.getByRole("group", { name: "Besprochene Sitzungen" })).getAllByRole("checkbox")[1]);
    expect(screen.queryByRole("button", { name: "A-2 entfernen" })).toBeNull();
  });

  // Patient:in gelöscht: ihr Anteil fehlt, die Gesamtdauer blieb. Die Zeit ohne Fall bleibt beim Speichern erhalten.
  it("zeigt Zeit ohne Fall als feste Zeile und rechnet sie in die Gesamtdauer ein", () => {
    const onSave = vi.fn(async () => {});
    renderForm(onSave, { durationMinutes: 50, caseShares: [{ patientId: newPatientId("p-1"), minutes: 25 }] });
    expect(screen.getByText("Ohne Fall (gelöschte Patient:in): 25 Min")).toBeDefined();
    expect(screen.getByText("Gesamt: 50 Min")).toBeDefined();
    fireEvent.change(screen.getByLabelText("A-1"), { target: { value: "30" } });
    expect(screen.getByText("Gesamt: 55 Min")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ durationMinutes: 55, caseShares: [{ patientId: "p-1", minutes: 30 }] })
    );
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

  // #37: Eine durch ein früheres Datum ausgeblendete neue Sitzung wird nicht unsichtbar mitgespeichert – sonst scheiterte
  // das Speichern an einem unsichtbaren Fall. Die Auswahl bleibt im Zustand, damit Zwischenwerte beim Tippen des
  // Datums nichts verwerfen.
  it("speichert nur zum Datum angebotene Sitzungen; Zurückstellen des Datums bringt Auswahl und Minuten wieder", () => {
    const onSave = vi.fn(async () => {});
    const spaet = { id: "t-3", label: "A-3 · 25.09.2026 · 50 Min", patientId: "p-3" };
    render(
      <SupervisionSessionEditForm
        session={session}
        supervisors={supervisors}
        linkOptionsFor={(date) => (date >= "2026-09-25" ? [...linkOptions, spaet] : linkOptions)}
        caseLabel={(id) => chiffren[id]}
        saving={false}
        onSave={onSave}
        onCancel={() => {}}
      />
    );
    const sitzungen = () => within(screen.getByRole("group", { name: "Besprochene Sitzungen" })).getAllByRole("checkbox");
    const datum = (value: string) => fireEvent.change(screen.getByLabelText("Datum"), { target: { value } });
    datum("2026-09-30");
    fireEvent.click(sitzungen()[2]);
    fireEvent.change(screen.getByLabelText("A-3"), { target: { value: "25" } });
    expect(screen.getByText("Gesamt: 85 Min")).toBeDefined();

    // Zwischenwert beim Tippen: Sitzung und Fall ausgeblendet, aber nicht verworfen
    datum("0002-09-30");
    expect(sitzungen()).toHaveLength(2);
    expect(screen.queryByLabelText("A-3")).toBeNull();
    expect(screen.getByText("Gesamt: 60 Min")).toBeDefined();
    datum("2026-09-30");
    expect(sitzungen()[2].getAttribute("aria-checked")).toBe("true");
    expect((screen.getByLabelText("A-3") as HTMLInputElement).value).toBe("25");

    // Früheres Datum speichern: ohne die ausgeblendete Sitzung und ohne ihren Fall
    datum("2026-09-20");
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).toHaveBeenCalledWith({
      supervisorId: "s-1",
      date: "2026-09-20",
      durationMinutes: 60,
      setting: "einzel",
      linkedIds: ["t-1"],
      caseShares: [{ patientId: "p-1", minutes: 60 }],
    });
  });

  it("behält gespeicherte Zuordnungen und Anteile beim Datumswechsel", () => {
    const onSave = vi.fn(async () => {});
    renderForm(onSave);
    fireEvent.change(screen.getByLabelText("Datum"), { target: { value: "2026-09-01" } });
    expect((screen.getByLabelText("A-1") as HTMLInputElement).value).toBe("60");
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ date: "2026-09-01", linkedIds: ["t-1"], caseShares: [{ patientId: "p-1", minutes: 60 }] })
    );
  });
});
