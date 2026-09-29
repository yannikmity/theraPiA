import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("../../app/(app)/supervisors/actions", () => ({ addSupervisor: vi.fn(), updateSupervisorAction: vi.fn() }));

import { SupervisorsClient } from "../../app/(app)/supervisors/SupervisorsClient";
import { addSupervisor, updateSupervisorAction } from "../../app/(app)/supervisors/actions";
import { newSupervisorId, type Supervisor } from "@/types";

const supervisors: Supervisor[] = [
  { id: newSupervisorId("s-1"), name: "Supervision Eins", costPerHour: 80, isActive: true },
  { id: newSupervisorId("s-2"), name: "Supervision Zwei", costPerHour: null, isActive: false },
];
const cardOf = (name: string) => screen.getByText(name).closest("[data-slot=card]") as HTMLElement;

describe("SupervisorsClient", () => {
  beforeEach(() => {
    vi.mocked(addSupervisor).mockReset();
    vi.mocked(updateSupervisorAction).mockReset();
  });

  it("zeigt einen Fehler beim Deaktivieren in der Karte der Supervisor:in, nicht am Seitenanfang", async () => {
    vi.mocked(updateSupervisorAction).mockResolvedValue({ success: false, error: "Supervisor:in nicht gefunden" });
    render(<SupervisorsClient initialSupervisors={supervisors} />);
    fireEvent.click(within(cardOf("Supervision Eins")).getByRole("button", { name: "Deaktivieren" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Supervisor:in nicht gefunden");
    expect(cardOf("Supervision Eins").contains(alert)).toBe(true);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("zeigt einen abgelehnten Aufruf beim Aktivieren (Netz weg) an der inaktiven Karte", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(updateSupervisorAction).mockRejectedValue(new TypeError("Failed to fetch"));
    render(<SupervisorsClient initialSupervisors={supervisors} />);
    fireEvent.click(within(cardOf("Supervision Zwei")).getByRole("button", { name: "Aktivieren" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Ein unerwarteter Fehler ist aufgetreten");
    expect(cardOf("Supervision Zwei").contains(alert)).toBe(true);
    expect(logged).toHaveBeenCalledWith("Server-Action fehlgeschlagen:", expect.any(TypeError));
    logged.mockRestore();
  });

  it("zeigt Fehler beim Anlegen im Formular und verwirft sie beim Schließen", async () => {
    vi.mocked(addSupervisor).mockResolvedValue({ success: false, error: "Ungültige Eingabe" });
    render(<SupervisorsClient initialSupervisors={supervisors} />);
    fireEvent.click(screen.getByRole("button", { name: "Neu" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Supervision Drei" } });
    fireEvent.click(screen.getByRole("button", { name: "Anlegen" }));
    const alert = await screen.findByRole("alert");
    expect(cardOf("Neue:r Supervisor:in").contains(alert)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Formular schließen" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
