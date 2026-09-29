import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TherapyHoursCard } from "../dashboard/TherapyHoursCard";

describe("TherapyHoursCard", () => {
  it("zeigt Stand, Ziel, Rest und die Stunden je Kategorie", () => {
    render(<TherapyHoursCard hours={412.33} target={600} categoryHours={{ sprechstunde: 0, probatorik: 20, behandlung: 380.33, bezugsperson: 12, gespraechsziffer: 0 }} />);
    const region = screen.getByRole("region", { name: "Behandlungsstunden" });
    expect(screen.getByRole("progressbar", { name: "Behandlungsstunden" }).getAttribute("aria-valuemax")).toBe("600");
    expect(region.textContent).toContain("Noch 187,7 Behandlungsstunden bis 600");
    expect(screen.getByText("Probatorik")).toBeDefined();
    expect(screen.getByText("380,3")).toBeDefined();
    expect(screen.getByText("Bezugsperson")).toBeDefined();
  });

  it("meldet ein erreichtes Ziel ohne negativen Rest", () => {
    render(<TherapyHoursCard hours={612} target={600} categoryHours={{ sprechstunde: 0, probatorik: 0, behandlung: 612, bezugsperson: 0, gespraechsziffer: 0 }} />);
    expect(screen.getByRole("region", { name: "Behandlungsstunden" }).textContent).toContain("Noch 0,0 Behandlungsstunden bis 600");
  });

  it("zeigt Ziel und Rest aus dem Regelwerk", () => {
    render(<TherapyHoursCard hours={412.33} target={500} categoryHours={{ sprechstunde: 0, probatorik: 20, behandlung: 380.33, bezugsperson: 12, gespraechsziffer: 0 }} />);
    expect(screen.getByRole("progressbar", { name: "Behandlungsstunden" }).getAttribute("aria-valuemax")).toBe("500");
    expect(screen.getByRole("region", { name: "Behandlungsstunden" }).textContent).toContain("Noch 87,7 Behandlungsstunden bis 500");
  });

  // Bei ca. 220 px Kartenbreite (#56) dürfen die Kategorie-Spalten nicht überlaufen: Zellen min-w-0, lange Wörter
  // wie „Bezugsperson“ werden getrennt bzw. umbrochen statt über den Kartenrand zu ragen – nicht abgeschnitten.
  it("hält die Kategorie-Beschriftungen in ihrer Spalte", () => {
    render(<TherapyHoursCard hours={24} target={600} categoryHours={{ sprechstunde: 0, probatorik: 2, behandlung: 21, bezugsperson: 1, gespraechsziffer: 0 }} />);
    for (const name of ["Probatorik", "Behandlung", "Bezugsperson"]) {
      const label = screen.getByText(name);
      const classes = label.className.split(" ");
      expect(classes, name).toContain("hyphens-auto");
      expect(classes, name).toContain("wrap-anywhere");
      expect(classes, name).not.toContain("truncate");
      expect(label.parentElement!.className.split(" "), name).toContain("min-w-0");
    }
  });
  // Sprechstunde und Gesprächsziffer nur mit Stunden (#66), die drei bisherigen Kategorien immer.
  it("zeigt Sprechstunde und Gesprächsziffer nur, wenn Stunden erfasst sind", () => {
    const { unmount } = render(<TherapyHoursCard hours={3} target={600} categoryHours={{ sprechstunde: 0, probatorik: 1, behandlung: 2, bezugsperson: 0, gespraechsziffer: 0 }} />);
    for (const name of ["Probatorik", "Behandlung", "Bezugsperson"]) expect(screen.getByText(name)).toBeDefined();
    expect(screen.queryByText("Sprechstunde")).toBeNull();
    expect(screen.queryByText("Gesprächsziffer")).toBeNull();
    unmount();
    render(<TherapyHoursCard hours={3.5} target={600} categoryHours={{ sprechstunde: 0.5, probatorik: 1, behandlung: 2, bezugsperson: 0, gespraechsziffer: 0 }} />);
    expect(screen.getByText("Sprechstunde")).toBeDefined();
    expect(screen.getByText("0,5")).toBeDefined();
    expect(screen.queryByText("Gesprächsziffer")).toBeNull();
  });
});
