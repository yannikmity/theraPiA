import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../../lib/analytics/track", () => ({ track: vi.fn() }));

import { QuickCaptureLink } from "../QuickCaptureLink";
import { track } from "../../lib/analytics/track";

const ID = "550e8400-e29b-41d4-a716-446655440000";

describe("QuickCaptureLink", () => {
  beforeEach(() => vi.mocked(track).mockReset());

  it("verlinkt auf das Erfassen-Formular mit vorgewählter Patient:in und meldet nur die Quelle", () => {
    const { container } = render(<QuickCaptureLink patientId={ID} chiffre="A-1" source="patient" />);
    // jsdom kann nicht navigieren – Standardaktion des Links unterdrücken.
    container.addEventListener("click", (e) => e.preventDefault());
    const link = screen.getByRole("link", { name: "Sitzung für A-1 erfassen" });
    expect(link.getAttribute("href")).toBe(`/sessions/new?patient=${ID}`);
    expect(link.textContent).toContain("Sitzung");
    fireEvent.click(link);
    expect(vi.mocked(track).mock.calls).toEqual([["quick_capture_used", { source: "patient" }]]);
  });

  it("compact: nur das Plus, die Beschriftung steht im aria-label", () => {
    render(<QuickCaptureLink patientId={ID} chiffre="A-1" source="dashboard" compact />);
    const link = screen.getByRole("link", { name: "Sitzung für A-1 erfassen" });
    expect(link.textContent).toBe("");
    expect(link.querySelector("svg")).not.toBeNull();
  });
});
