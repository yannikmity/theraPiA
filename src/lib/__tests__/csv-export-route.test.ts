// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { sampleUserData } from "./helpers/user-data-fixture";

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; role: string } },
  loadedFor: [] as string[],
}));

vi.mock("@/lib/auth", () => ({ auth: async () => state.session }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/db/user-data", () => ({
  loadUserData: async (_db: unknown, userId: string) => {
    state.loadedFor.push(userId);
    return sampleUserData();
  },
}));

import { GET } from "@/app/api/export/csv/[entity]/route";

function get(entity: string, query = "") {
  return GET(new Request(`http://localhost:3000/api/export/csv/${entity}${query}`), {
    params: Promise.resolve({ entity }),
  });
}

describe("GET /api/export/csv/[entity]", () => {
  beforeEach(() => {
    state.session = { user: { id: "u-1", role: "pia" } };
    state.loadedFor = [];
  });

  it("ohne Sitzung 401, ohne Daten zu laden", async () => {
    state.session = null;
    expect((await get("expenses")).status).toBe(401);
    expect(state.loadedFor).toEqual([]);
  });

  it("Ausgaben ohne Jahr: alle Supervisionen, Dateiname ohne Jahr", async () => {
    const res = await get("expenses");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="therapia-ausgaben-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect((await res.text()).split("\r\n").at(-2)).toBe("Summe;;;;;;;;192,00");
    expect(state.loadedFor).toEqual(["u-1"]);
  });

  it("Ausgaben mit ?jahr=: Jahr im Dateinamen, nur dieses Jahr", async () => {
    const res = await get("expenses", "?jahr=2025");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/filename="therapia-ausgaben-2025-stand-\d{4}-\d{2}-\d{2}\.csv"/);
    expect((await res.text()).split("\r\n").slice(1, -1)).toEqual(["Summe;;;;;;;;0,00"]);
  });

  it("ungültiges Jahr: 400, ohne Daten zu laden", async () => {
    for (const jahr of ["abc", "20266", ""]) {
      const res = await get("expenses", `?jahr=${jahr}`);
      expect(res.status).toBe(400);
    }
    expect(state.loadedFor).toEqual([]);
  });

  it("andere Exporte ignorieren ?jahr=", async () => {
    const res = await get("patients", "?jahr=abc");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/filename="therapia-patientinnen-/);
  });

  it("unbekannter Export: 404", async () => {
    expect((await get("users")).status).toBe(404);
  });
});
