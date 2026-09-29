import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { NachweisFilterForm } from "../../app/(app)/nachweis/NachweisFilterForm";

const EINS = "550e8400-e29b-41d4-a716-446655440000";
const ALT = "550e8400-e29b-41d4-a716-446655440001";
const props = {
  filter: { from: "2026-01-01", to: "2026-03-31", supervisorId: null },
  supervisors: [
    { id: EINS, name: "Supervision Eins", isActive: true },
    { id: ALT, name: "Supervision Alt", isActive: false },
  ],
  firstRecordDate: "2025-10-06",
  today: "2026-09-26",
};

describe("NachweisFilterForm", () => {
  beforeEach(() => push.mockReset());

  it("benennt das Formular eindeutig, ohne mit dem Feld „Supervisor:in“ zu kollidieren", () => {
    render(<NachweisFilterForm {...props} />);
    expect(screen.getByRole("form", { name: "Nachweis filtern" })).toBeDefined();
    expect(screen.getAllByLabelText(/Supervisor:in/)).toHaveLength(1);
  });

  it("Vorgaben navigieren sofort und behalten die gewählte Supervisor:in", () => {
    render(<NachweisFilterForm {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Aktuelles Quartal" }));
    expect(push).toHaveBeenLastCalledWith("/nachweis?from=2026-07-01&to=2026-09-30");
    fireEvent.change(screen.getByLabelText("Supervisor:in"), { target: { value: EINS } });
    fireEvent.click(screen.getByRole("button", { name: "Ausbildung gesamt" }));
    expect(push).toHaveBeenLastCalledWith(`/nachweis?from=2025-10-06&to=2026-09-26&supervisor=${EINS}`);
  });

  it("freie Daten und Supervisor:in gehen mit „Anzeigen“ in die Adresse", () => {
    render(<NachweisFilterForm {...props} />);
    fireEvent.change(screen.getByLabelText("Von"), { target: { value: "2026-02-01" } });
    fireEvent.change(screen.getByLabelText("Bis"), { target: { value: "2026-02-28" } });
    fireEvent.change(screen.getByLabelText("Supervisor:in"), { target: { value: ALT } });
    fireEvent.click(screen.getByRole("button", { name: "Anzeigen" }));
    expect(push).toHaveBeenCalledWith(`/nachweis?from=2026-02-01&to=2026-02-28&supervisor=${ALT}`);
  });

  it("lehnt „Von“ nach „Bis“ ab, ohne zu navigieren", () => {
    render(<NachweisFilterForm {...props} />);
    fireEvent.change(screen.getByLabelText("Von"), { target: { value: "2026-04-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Anzeigen" }));
    expect(screen.getByText("„Von“ darf nicht nach „Bis“ liegen")).toBeDefined();
    expect(screen.getByLabelText("Bis").getAttribute("aria-invalid")).toBe("true");
    expect(push).not.toHaveBeenCalled();
  });

  it("markiert die passende Vorgabe und kennzeichnet inaktive Supervisor:innen", () => {
    render(<NachweisFilterForm {...props} filter={{ from: "2026-07-01", to: "2026-09-30", supervisorId: null }} />);
    expect(screen.getByRole("button", { name: "Aktuelles Quartal" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Letztes Quartal" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("option", { name: "Supervision Alt (inaktiv)" })).toBeDefined();
    expect(screen.getByRole("option", { name: "Alle (Unterschrift Institut/Ambulanz)" })).toBeDefined();
  });
});
