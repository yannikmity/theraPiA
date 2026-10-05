import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

// Echtes next/navigation (runAction nutzt unstable_rethrow), nur der Router ist gemockt.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../lib/analytics/track", () => ({ track: vi.fn(), trackFailure: vi.fn() }));
vi.mock("../../app/(app)/patients/actions", () => ({ addPatient: vi.fn() }));

import { PatientsClient } from "../../app/(app)/patients/PatientsClient";
import { standardRegelwerk } from "../../lib/ausbildungsregeln/resolve";
import { newPatientId, newTherapySessionId, type Patient, type TherapySession } from "@/types";

const R = standardRegelwerk().regeln;
const P1 = "550e8400-e29b-41d4-a716-446655440001";
const P2 = "550e8400-e29b-41d4-a716-446655440002";

const patient = (id: string, chiffre: string): Patient => ({
  id: newPatientId(id),
  chiffre,
  therapyType: "langzeittherapie",
  startDate: "2026-01-05",
  endDate: null,
  isActive: true,
  createdAt: "2026-01-05T08:00:00.000Z",
  antragsdatum: null,
  beantragteStunden: null,
  genehmigungsdatum: null,
  sprechstundenAmbulanz: 0,
});
const open = (id: string, patientId: string, date: string): TherapySession => ({
  id: newTherapySessionId(id),
  patientId: newPatientId(patientId),
  date,
  durationMinutes: 50,
  notes: "",
  category: "behandlung",
});

const a1 = patient(P1, "A-1");
const a2 = patient(P2, "A-2");
const fuenf = [1, 2, 3, 4, 5].map((n) => open(`a1-${n}`, P1, `2026-09-0${n}`));
const vier = [1, 2, 3, 4].map((n) => open(`a2-${n}`, P2, `2026-09-0${n}`));

describe("PatientsClient", () => {
  it("markiert Patient:innen mit 5 Sitzungen ohne Supervision", () => {
    render(<PatientsClient initialPatients={[a1, a2]} initialTherapySessions={[...fuenf, ...vier]} initialSupervisionSessions={[]} regeln={R} />);
    const row = (chiffre: string) => screen.getByText(chiffre).closest("a")!;
    expect(within(row("A-1")).getByText("SV fällig")).toBeDefined();
    expect(within(row("A-2")).queryByText("SV fällig")).toBeNull();
  });
});
