import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { SupervisionSessionEditForm } from "../../app/(app)/supervision/SupervisionSessionEditForm";
import { newSupervisionSessionId, newSupervisorId, newTherapySessionId, type SupervisionSession, type Supervisor } from "@/types";

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
};
const linkOptions = [
  { id: "t-1", label: "A-1 · 10.09.2026 · 50 Min" },
  { id: "t-2", label: "A-2 · 12.09.2026 · 50 Min" },
];
const renderForm = (onSave = vi.fn(async () => {}), overrides: Partial<SupervisionSession> = {}) =>
  render(
    <SupervisionSessionEditForm session={{ ...session, ...overrides }} supervisors={supervisors} linkOptionsFor={() => linkOptions} saving={false} onSave={onSave} onCancel={() => {}} />
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
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).toHaveBeenCalledWith({ supervisorId: "s-1", date: "2026-09-20", durationMinutes: 60, setting: "einzel", linkedIds: ["t-1", "t-2"] });
  });

  it("nennt die Gruppe bei Gruppen-Supervision „Besprochene Doppelstunden“", () => {
    renderForm(undefined, { kind: "group", linkedTherapySessionIds: [], linkedGroupSessionIds: [] });
    expect(screen.getByRole("group", { name: "Besprochene Doppelstunden" })).toBeDefined();
  });

  it("meldet Dauer 0 am Feld und speichert nicht", () => {
    const onSave = vi.fn(async () => {});
    renderForm(onSave);
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
