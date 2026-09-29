import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContingentTile } from "../../app/(app)/patients/[id]/ContingentTile";

describe("ContingentTile", () => {
  it("zeigt „–“ ohne Antrag", () => {
    render(<ContingentTile remaining={null} />);
    expect(screen.getByText("–")).toBeDefined();
    expect(screen.getByText("Behandlungsstunden übrig (Antrag)")).toBeDefined();
  });

  it("zeigt den Rest in Behandlungsstunden mit Dezimalkomma", () => {
    render(<ContingentTile remaining={57} />);
    expect(screen.getByText("57,0").className).toContain("text-foreground");
    expect(screen.getByText("Behandlungsstunden übrig (Antrag)")).toBeDefined();
  });

  it("zeigt eine Überziehung als Stunden über dem Antrag in Rot – nicht als negatives „übrig“", () => {
    render(<ContingentTile remaining={-2.5} />);
    const value = screen.getByText("2,5");
    expect(value.className).toContain("text-destructive");
    expect(screen.getByText("Behandlungsstunden über dem Antrag")).toBeDefined();
    expect(screen.queryByText(/-2,5/)).toBeNull();
  });

  it("rundet eine Minute Überziehung nicht zu „0,0 über dem Antrag“", () => {
    render(<ContingentTile remaining={-0.02} />);
    expect(screen.getByText("0,0").className).toContain("text-foreground");
    expect(screen.getByText("Behandlungsstunden übrig (Antrag)")).toBeDefined();
  });
});
