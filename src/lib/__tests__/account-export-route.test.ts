// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { sampleUserData } from "./helpers/user-data-fixture";
import { KEINE_ABWEICHUNGEN } from "../ausbildungsregeln/model";

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; role: string } },
  // Je Lader: in welchem Snapshot (Nummer) er lief; -1 = außerhalb.
  loaded: [] as [string, number][],
  snapshots: 0,
  current: -1,
}));

vi.mock("@/lib/auth", () => ({ auth: async () => state.session }));
vi.mock("@/lib/db", () => ({
  withSnapshot: async (fn: (tx: unknown) => Promise<unknown>) => {
    state.current = ++state.snapshots;
    try {
      return await fn({});
    } finally {
      state.current = -1;
    }
  },
}));
vi.mock("@/lib/db/user-data", () => ({
  loadUserData: async () => {
    state.loaded.push(["userData", state.current]);
    return sampleUserData();
  },
  loadCreatedInvitations: async () => {
    state.loaded.push(["invitations", state.current]);
    return [];
  },
}));
vi.mock("@/lib/services/ausbildungsregeln", () => ({
  loadAbweichungen: async () => {
    state.loaded.push(["abweichungen", state.current]);
    return { ...KEINE_ABWEICHUNGEN, behandlungsstundenZiel: 450 };
  },
}));

import { GET } from "@/app/api/account/export/route";

describe("GET /api/account/export", () => {
  beforeEach(() => {
    state.session = { user: { id: "u-1", role: "pia" } };
    state.loaded = [];
    state.snapshots = 0;
  });

  it("ohne Sitzung 401, ohne Daten zu laden", async () => {
    state.session = null;
    expect((await GET()).status).toBe(401);
    expect(state.loaded).toEqual([]);
  });

  it("lädt Daten, Einladungen und Regelabweichungen in einem gemeinsamen Snapshot (#41)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(state.loaded).toEqual([
      ["userData", 1],
      ["invitations", 1],
      ["abweichungen", 1],
    ]);
    const json = JSON.parse(await res.text());
    expect(json.version).toBe(7);
    expect(json.supervisionSessions.map((s: { groupId: unknown }) => s.groupId)).toEqual([null, null, "g-1"]);
    expect(json.financialSettings).toEqual({ incomePerHour: 40, plannedSessionsPerWeek: null });
    expect(json.ausbildungsregelnAbweichungen.behandlungsstundenZiel).toBe(450);
  });
});
