// @vitest-environment node
// Gruppendetailseite (#47): Gruppen-Supervisionen nur der geöffneten Gruppe, über den gespeicherten Gruppenbezug –
// mit echter Datenbank und ohne NextAuth.
import { describe, it, expect, afterEach, vi } from "vitest";
import type { Client } from "pg";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture } from "./helpers/fixtures";

const state = vi.hoisted(() => ({ client: undefined as Client | undefined, userId: "" as string | null }));

vi.mock("../auth", () => ({
  auth: async () => (state.userId ? { user: { id: state.userId, role: "pia" }, expires: "" } : null),
}));
vi.mock("../db", () => {
  // Der Loader fragt per Promise.all parallel ab; auf der einen Testverbindung nacheinander stellen.
  let queue: Promise<unknown> = Promise.resolve();
  const query = (text: string, params?: unknown[]) => {
    const result = queue.then(() => state.client!.query(text, params));
    queue = result.catch(() => undefined);
    return result;
  };
  return {
    query,
    db: { query },
    withTransaction: async <T,>(fn: (tx: Client) => Promise<T>): Promise<T> => {
      await query("BEGIN");
      try {
        const result = await fn(state.client!);
        await query("COMMIT");
        return result;
      } catch (error) {
        await query("ROLLBACK");
        throw error;
      }
    },
  };
});

import { loadGroupDetailData, addGroupSupervisionSession, deleteGroupSession } from "@/app/(app)/groups/[id]/actions";
import { updateSupervisionSessionAction } from "@/app/(app)/supervision/actions";
import { getSupervisionSessions } from "../db/index";

describe.skipIf(!TEST_DATABASE_URL)("Gruppendetail: Gruppen-Supervisionen je Gruppe", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
    state.client = undefined;
  });

  // Zwei Gruppen von A: die Fixture-Gruppe mit einer Doppelstunde und eine zweite mit eigener Doppelstunde.
  async function setup() {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    state.client = t.client;
    state.userId = f.a.userId;
    const groupB = (
      await t.client.query(
        "INSERT INTO groups (user_id, name, start_date, planned_session_count) VALUES ($1, 'Gruppe B', '2026-01-01', 10) RETURNING id",
        [f.a.userId]
      )
    ).rows[0].id as string;
    const sessionB = (
      await t.client.query(
        "INSERT INTO group_sessions (user_id, group_id, date, status, child_count) VALUES ($1, $2, '2026-01-04', 'durchgefuehrt', 6) RETURNING id",
        [f.a.userId, groupB]
      )
    ).rows[0].id as string;
    return { f, groupA: f.a.groupId, sessionA: f.a.groupSessionId, groupB, sessionB };
  }

  const supervisionInput = (supervisorId: string, groupId: string, linkedGroupSessionIds: string[]) => ({
    groupId,
    supervisorId,
    date: "2026-01-10",
    durationMinutes: 60,
    kind: "group" as const,
    setting: "einzel" as const,
    linkedTherapySessionIds: [],
    linkedGroupSessionIds,
    caseShares: [],
  });

  async function addSupervision(supervisorId: string, groupId: string, linked: string[]) {
    const before = new Set((await getSupervisionSessions()).map((s) => s.id));
    const result = await addGroupSupervisionSession(supervisionInput(supervisorId, groupId, linked));
    if (!result.success) throw new Error(`Supervision nicht angelegt: ${JSON.stringify(result)}`);
    return (await getSupervisionSessions()).find((s) => !before.has(s.id))!.id;
  }

  const idsOf = async (groupId: string) => (await loadGroupDetailData(groupId)).supervisionSessions.map((s) => s.id);

  it("zeigt die Supervision nur in der Gruppe, auf deren Seite sie angelegt wurde", async () => {
    const { f, groupA, sessionA, groupB } = await setup();
    const svA = await addSupervision(f.a.supervisorId, groupA, [sessionA]);

    expect(await idsOf(groupA)).toEqual([svA]);
    expect(await idsOf(groupB)).toEqual([]);
  });

  it("zeigt eine Gruppen-Supervision ohne Doppelstunde in ihrer Gruppe", async () => {
    const { f, groupA, groupB } = await setup();
    const result = await addGroupSupervisionSession(supervisionInput(f.a.supervisorId, groupA, []));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.supervisionSessions).toHaveLength(1);

    expect(await idsOf(groupA)).toHaveLength(1);
    expect(await idsOf(groupB)).toEqual([]);
  });

  it("behält die Supervision in der Gruppe, wenn ihre einzige Doppelstunde gelöscht wird", async () => {
    const { f, groupA, sessionA } = await setup();
    const svA = await addSupervision(f.a.supervisorId, groupA, [sessionA]);

    const result = await deleteGroupSession({ id: sessionA, groupId: groupA });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.supervisionSessions.map((s) => s.id)).toEqual([svA]);
  });

  it("behält die Gruppe beim Bearbeiten auf der Supervisionsseite, auch ohne Doppelstunden", async () => {
    const { f, groupA, sessionA, groupB } = await setup();
    const svA = await addSupervision(f.a.supervisorId, groupA, [sessionA]);

    const result = await updateSupervisionSessionAction({
      ...supervisionInput(f.a.supervisorId, groupA, []),
      id: svA,
      durationMinutes: 90,
    });

    expect(result.success).toBe(true);
    expect(await idsOf(groupA)).toEqual([svA]);
    expect(await idsOf(groupB)).toEqual([]);
  });

  it("nimmt der Supervision die Gruppe, wenn sie zur Einzelsupervision wird", async () => {
    const { f, groupA, sessionA } = await setup();
    const svA = await addSupervision(f.a.supervisorId, groupA, [sessionA]);

    const result = await updateSupervisionSessionAction({
      ...supervisionInput(f.a.supervisorId, groupA, []),
      id: svA,
      kind: "individual",
    });

    expect(result.success).toBe(true);
    expect(await idsOf(groupA)).toEqual([]);
    expect((await getSupervisionSessions()).find((s) => s.id === svA)?.groupId).toBeNull();
  });

  it("lehnt Doppelstunden einer anderen Gruppe und fremde Gruppen ab", async () => {
    const { f, groupA, sessionA, sessionB } = await setup();

    const andereGruppe = await addGroupSupervisionSession(supervisionInput(f.a.supervisorId, groupA, [sessionA, sessionB]));
    expect(andereGruppe).toMatchObject({ success: false, error: "Nur Doppelstunden dieser Gruppe verknüpfen" });
    const fremd = await addGroupSupervisionSession(supervisionInput(f.a.supervisorId, f.b.groupId, []));
    expect(fremd.success).toBe(false);

    expect((await getSupervisionSessions()).filter((s) => s.kind === "group")).toEqual([]);
  });

  it("meldet eine schon zugeordnete Doppelstunde der Gruppe weiterhin als Konflikt (#35)", async () => {
    const { f, groupA, sessionA } = await setup();
    await addSupervision(f.a.supervisorId, groupA, [sessionA]);

    const zweite = await addGroupSupervisionSession(supervisionInput(f.a.supervisorId, groupA, [sessionA]));

    expect(zweite.success).toBe(false);
    if (!zweite.success) expect(zweite.error).toMatch(/schon einer anderen Supervision zugeordnet/);
    expect(await idsOf(groupA)).toHaveLength(1);
  });

  it("zeigt keine Einzelsupervision in der Gruppe", async () => {
    const { groupA } = await setup();
    expect(await idsOf(groupA)).toEqual([]);
  });
});
