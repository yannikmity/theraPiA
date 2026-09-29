import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KontingentTile } from "../../app/(app)/patients/[id]/KontingentTile";

// Untertitel steht in zwei Elementen (Klammerteil bricht nicht um), daher über den Text des Absatzes prüfen.
const untertitel = (container: HTMLElement) => container.querySelectorAll("p")[1].textContent;

describe("KontingentTile (#66)", () => {
  it("zeigt den Rest und „übrig x von y“", () => {
    const { container } = render(<KontingentTile titel="Sprechstunde" einheit="Termine" kontingent={{ genutzt: 3, verfuegbar: 8 }} />);
    expect(screen.getByText("5").className).toContain("text-foreground");
    expect(untertitel(container)).toBe("Termine übrig · Sprechstunde (3 von 8)");
  });

  it("zeigt eine Überziehung rot als „über dem Kontingent“ – nicht als negatives „übrig“", () => {
    const { container } = render(<KontingentTile titel="Probatorik" einheit="Sitzungen" kontingent={{ genutzt: 7, verfuegbar: 6 }} />);
    expect(screen.getByText("1").className).toContain("text-destructive");
    expect(untertitel(container)).toBe("Sitzungen über dem Kontingent · Probatorik (7 von 6)");
    expect(screen.queryByText(/übrig/)).toBeNull();
  });

  it("zeigt Bruchteile mit einer Nachkommastelle und Dezimalkomma", () => {
    const { container } = render(<KontingentTile titel="Probatorik" einheit="Sitzungen" kontingent={{ genutzt: 2.5, verfuegbar: 6 }} />);
    expect(screen.getByText("3,5")).toBeDefined();
    expect(untertitel(container)).toBe("Sitzungen übrig · Probatorik (2,5 von 6)");
  });

  it("zeigt eine Überziehung unter der Anzeige-Rundung (0,0) nicht rot, sondern als „übrig“", () => {
    const { container } = render(<KontingentTile titel="Sprechstunde" einheit="Termine" kontingent={{ genutzt: 8.04, verfuegbar: 8 }} />);
    const zahl = screen.getByText("0,0");
    expect(zahl.className).not.toContain("text-destructive");
    expect(untertitel(container)).toMatch(/^Termine übrig/);
  });

  it("zeigt ein genau aufgebrauchtes Kontingent als „0 übrig“, nicht rot", () => {
    const { container } = render(<KontingentTile titel="Probatorik" einheit="Sitzungen" kontingent={{ genutzt: 6, verfuegbar: 6 }} />);
    const zahl = screen.getByText("0");
    expect(zahl.className).not.toContain("text-destructive");
    expect(untertitel(container)).toMatch(/übrig/);
  });

  it("hält den Klammerteil „(x von y)“ ohne Umbruch zusammen", () => {
    render(<KontingentTile titel="Sprechstunde" einheit="Termine" kontingent={{ genutzt: 3, verfuegbar: 8 }} />);
    expect(screen.getByText("(3 von 8)").className).toContain("whitespace-nowrap");
  });
});
