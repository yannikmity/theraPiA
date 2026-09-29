import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@/lib/analytics/track", () => ({ track: vi.fn() }));

import { track } from "@/lib/analytics/track";
import { ExpenseExport } from "../../app/(app)/finances/ExpenseExport";

afterEach(() => {
  cleanup();
  vi.mocked(track).mockClear();
});

const link = () => screen.getByRole("link", { name: /Ausgaben als CSV/ });

describe("ExpenseExport (#65)", () => {
  it("wählt das neueste Jahr vor und verlinkt den Export mit ?jahr=", () => {
    render(<ExpenseExport years={[2026, 2025]} />);
    expect((screen.getByLabelText("Zeitraum") as HTMLSelectElement).value).toBe("2026");
    expect(link().getAttribute("href")).toBe("/api/export/csv/expenses?jahr=2026");
    expect(link().hasAttribute("download")).toBe(true);
  });

  it("wechselt Jahr und „Alle Jahre“", () => {
    render(<ExpenseExport years={[2026, 2025]} />);
    fireEvent.change(screen.getByLabelText("Zeitraum"), { target: { value: "2025" } });
    expect(link().getAttribute("href")).toBe("/api/export/csv/expenses?jahr=2025");
    fireEvent.change(screen.getByLabelText("Zeitraum"), { target: { value: "alle" } });
    expect(link().getAttribute("href")).toBe("/api/export/csv/expenses");
  });

  it("meldet beim Klick nur die Datenart", () => {
    const { container } = render(<ExpenseExport years={[2026]} />);
    container.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(link());
    expect(vi.mocked(track).mock.calls).toEqual([["export_downloaded", { entity: "expenses" }]]);
  });

  it("ohne Supervisionen nichts anzeigen", () => {
    const { container } = render(<ExpenseExport years={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
