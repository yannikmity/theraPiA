// @vitest-environment node
// Seitenschutz der Pflegeseiten (#8): Nicht-Admins landen auf dem Dashboard, bevor irgendetwas geladen wird.
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({ role: "pia" as "pia" | "admin" }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));
// Die Seite importiert über Formular → Actions → safe-action auch @/lib/auth; next-auth ist in Vitest nicht importierbar.
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/require-session", () => ({
  requireSession: async () => ({ user: { id: "550e8400-e29b-41d4-a716-446655440001", role: state.role } }),
}));
vi.mock("@/lib/services/ausbildungsregeln", () => ({
  loadAusbildungsprofilDaten: vi.fn(async () => ({ regeln: {}, quelle: "standard", standard: {} })),
  loadEbmStaffelnFuerPflege: vi.fn(async () => []),
}));

import { redirect } from "next/navigation";
import { loadAusbildungsprofilDaten, loadEbmStaffelnFuerPflege } from "@/lib/services/ausbildungsregeln";
import AusbildungsprofilPage from "@/app/(app)/admin/ausbildungsprofil/page";
import EbmStaffelPage from "@/app/(app)/admin/ebm-staffel/page";

beforeEach(() => {
  vi.mocked(redirect).mockClear();
  vi.mocked(loadAusbildungsprofilDaten).mockClear();
  vi.mocked(loadEbmStaffelnFuerPflege).mockClear();
});

describe("Seitenschutz Ausbildungsprofil (#8)", () => {
  it("leitet PiA auf / um und lädt nichts", async () => {
    state.role = "pia";
    await expect(AusbildungsprofilPage()).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
    expect(loadAusbildungsprofilDaten).not.toHaveBeenCalled();
  });

  it("zeigt Admins die Seite", async () => {
    state.role = "admin";
    await AusbildungsprofilPage();
    expect(redirect).not.toHaveBeenCalled();
    expect(loadAusbildungsprofilDaten).toHaveBeenCalledTimes(1);
  });
});

describe("Seitenschutz EBM-Staffel (#8)", () => {
  it("leitet PiA auf / um und lädt nichts", async () => {
    state.role = "pia";
    await expect(EbmStaffelPage()).rejects.toThrow("REDIRECT");
    expect(loadEbmStaffelnFuerPflege).not.toHaveBeenCalled();
  });

  it("zeigt Admins die Seite", async () => {
    state.role = "admin";
    await EbmStaffelPage();
    expect(redirect).not.toHaveBeenCalled();
    expect(loadEbmStaffelnFuerPflege).toHaveBeenCalledTimes(1);
  });
});
