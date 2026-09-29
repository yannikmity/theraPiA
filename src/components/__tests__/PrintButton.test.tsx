import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../../lib/analytics/track", () => ({ track: vi.fn() }));

import { PrintButton } from "../../app/(app)/nachweis/PrintButton";
import { track } from "../../lib/analytics/track";

describe("PrintButton", () => {
  it("öffnet den Druckdialog und meldet nur, ob nach Supervisor:in gefiltert war", () => {
    const print = vi.fn();
    window.print = print;
    render(<PrintButton supervisor />);
    fireEvent.click(screen.getByRole("button", { name: "Drucken / PDF" }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("nachweis_printed", { supervisor: true });
  });
});
