import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../../lib/analytics/track", () => ({ track: vi.fn() }));

import { CSV_LINKS, ExportLinks } from "../../app/(app)/profile/data/ExportLinks";
import { track } from "../../lib/analytics/track";

describe("ExportLinks", () => {
  beforeEach(() => vi.mocked(track).mockReset());

  it("bietet vier CSV-Dateien und den JSON-Export als Download-Links auf die bestehenden Routen", () => {
    render(<ExportLinks />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/api/export/csv/therapy-sessions",
      "/api/export/csv/supervisions",
      "/api/export/csv/group-sessions",
      "/api/export/csv/patients",
      "/api/export/csv/expenses",
      "/api/account/export",
    ]);
    expect(links.every((l) => l.hasAttribute("download"))).toBe(true);
    expect(CSV_LINKS.map((l) => l.entity)).toEqual(["therapy_sessions", "supervisions", "group_sessions", "patients", "expenses"]);
  });

  it("meldet beim Klick nur die Datenart", () => {
    const { container } = render(<ExportLinks />);
    // jsdom kann nicht navigieren – Standardaktion der Links unterdrücken.
    container.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(screen.getByRole("link", { name: /Patient:innen/ }));
    fireEvent.click(screen.getByRole("link", { name: /JSON/ }));
    expect(vi.mocked(track).mock.calls).toEqual([
      ["export_downloaded", { entity: "patients" }],
      ["export_downloaded", { entity: "json" }],
    ]);
  });

  it("erklärt Formate und Grenzen", () => {
    render(<ExportLinks />);
    expect(screen.getByText(/Semikolon/)).toBeDefined();
    expect(screen.getByText(/Art\. 20 DSGVO/)).toBeDefined();
    expect(screen.getByText(/keine Passwörter/)).toBeDefined();
  });
});
