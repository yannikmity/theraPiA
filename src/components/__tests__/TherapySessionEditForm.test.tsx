import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TherapySessionEditForm } from "../../app/(app)/patients/[id]/TherapySessionEditForm";
import { newPatientId, newTherapySessionId, type TherapySession } from "@/types";

const session: TherapySession = {
  id: newTherapySessionId("t-1"),
  patientId: newPatientId("p-1"),
  date: "2026-09-21",
  durationMinutes: 50,
  notes: "",
  category: "behandlung",
};

describe("TherapySessionEditForm", () => {
  it("meldet Dauer 0 am Feld mit eigener Meldung statt Browser-Tooltip und speichert nicht", () => {
    const onSave = vi.fn(async () => {});
    const { container } = render(<TherapySessionEditForm session={session} saving={false} onSave={onSave} onCancel={() => {}} />);
    expect(container.querySelector("form")!.noValidate).toBe(true);
    const duration = screen.getByLabelText("Dauer (Minuten)") as HTMLInputElement;
    fireEvent.change(duration, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).not.toHaveBeenCalled();
    const message = screen.getByText("Dauer muss mindestens 1 Minute sein");
    expect(duration.getAttribute("aria-invalid")).toBe("true");
    expect(duration.getAttribute("aria-describedby")).toBe(message.id);
    expect(document.activeElement).toBe(duration);
    fireEvent.change(duration, { target: { value: "45" } });
    expect(screen.queryByText("Dauer muss mindestens 1 Minute sein")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).toHaveBeenCalledWith({ date: "2026-09-21", durationMinutes: 45, notes: "", category: "behandlung" });
  });

  it("meldet eine geleerte Dauer mit „Bitte eine Dauer angeben“", () => {
    const onSave = vi.fn(async () => {});
    render(<TherapySessionEditForm session={session} saving={false} onSave={onSave} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText("Dauer (Minuten)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Bitte eine Dauer angeben")).toBeDefined();
  });

  it("meldet ein geleertes Datum am Feld, fokussiert es und speichert nicht", () => {
    const onSave = vi.fn(async () => {});
    render(<TherapySessionEditForm session={session} saving={false} onSave={onSave} onCancel={() => {}} />);
    const date = screen.getByLabelText("Datum") as HTMLInputElement;
    fireEvent.change(date, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).not.toHaveBeenCalled();
    const message = screen.getByText("Bitte ein Datum angeben");
    expect(date.getAttribute("aria-invalid")).toBe("true");
    expect(date.getAttribute("aria-describedby")).toBe(message.id);
    expect(document.activeElement).toBe(date);
    fireEvent.change(date, { target: { value: "2026-09-22" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).toHaveBeenCalledWith({ date: "2026-09-22", durationMinutes: 50, notes: "", category: "behandlung" });
  });

  it("bietet alle fünf Kategorien in fester Reihenfolge an und speichert eine Gesprächsziffer (#66)", () => {
    const onSave = vi.fn(async () => {});
    render(<TherapySessionEditForm session={session} saving={false} onSave={onSave} onCancel={() => {}} />);
    const select = screen.getByLabelText("Kategorie") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      "Sprechstunde", "Probatorik", "Behandlung", "Bezugsperson", "Gesprächsziffer",
    ]);
    fireEvent.change(select, { target: { value: "gespraechsziffer" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSave).toHaveBeenCalledWith({ date: "2026-09-21", durationMinutes: 50, notes: "", category: "gespraechsziffer" });
  });
});
