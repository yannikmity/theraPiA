import { describe, it, expect } from "vitest";
import { NAV_ITEMS, isNavItemActive, navItemsFor } from "../layout/nav-items";

const byHref = (href: string) => NAV_ITEMS.find((item) => item.href === href)!;

describe("Navigation", () => {
  it("Dashboard ist nur auf / aktiv", () => {
    expect(isNavItemActive(byHref("/"), "/")).toBe(true);
    expect(isNavItemActive(byHref("/"), "/patients")).toBe(false);
  });

  it("Unterseiten aktivieren ihren Bereich, ähnliche Präfixe nicht", () => {
    expect(isNavItemActive(byHref("/patients"), "/patients/abc")).toBe(true);
    expect(isNavItemActive(byHref("/sessions/new"), "/sessions/new")).toBe(true);
    expect(isNavItemActive(byHref("/supervision"), "/supervisors")).toBe(true);
    expect(isNavItemActive(byHref("/profile"), "/profile/password")).toBe(true);
    expect(isNavItemActive(byHref("/profile"), "/checklist")).toBe(true);
    expect(isNavItemActive(byHref("/profile"), "/profiles")).toBe(false);
    expect(isNavItemActive(byHref("/nachweis"), "/nachweis")).toBe(true);
    expect(isNavItemActive(byHref("/profile"), "/profile/data")).toBe(true);
  });

  it("Administration nur für Admins und nie in der Bottom-Navigation", () => {
    expect(navItemsFor("pia", "sidebar").map((i) => i.href)).not.toContain("/admin");
    expect(navItemsFor("admin", "sidebar").map((i) => i.href)).toContain("/admin");
    expect(navItemsFor("admin", "bottom").map((i) => i.href)).toEqual([
      "/",
      "/sessions/new",
      "/patients",
      "/finances",
      "/profile",
    ]);
  });

  it("Seitenleiste enthält alle Hauptbereiche in fester Reihenfolge", () => {
    expect(navItemsFor("pia", "sidebar").map((i) => i.label)).toEqual([
      "Dashboard",
      "Erfassen",
      "Patient:innen",
      "Supervision",
      "Gruppen",
      "Finanzen",
      "Nachweis",
      "Profil",
    ]);
  });
});
