// @vitest-environment node
// Gruppendetailseite (#47): Gruppen-Supervisionen nur der geöffneten Gruppe – mit echter Datenbank und ohne NextAuth.
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

  it("zeigt die Supervision nur in der Gruppe, deren Doppelstunde sie bespricht", async () => {
    const { f, groupA, sessionA, groupB } = await setup();
    const svA = await addSupervision(f.a.supervisorId, groupA, [sessionA]);

    expect(await idsOf(groupA)).toEqual([svA]);
    expect(await idsOf(groupB)).toEqual([]);
  });

  it("zeigt eine Supervision, die Doppelstunden beider Gruppen bespricht, in beiden Gruppen", async () => {
    const { f, groupA, sessionA, groupB, sessionB } = await setup();
    const svBoth = await addSupervision(f.a.supervisorId, groupA, [sessionA, sessionB]);

    expect(await idsOf(groupA)).toEqual([svBoth]);
    expect(await idsOf(groupB)).toEqual([svBoth]);
  });

  it("zeigt eine Gruppen-Supervision ohne Doppelstunde in keiner Gruppe, die Supervisionsliste behält sie", async () => {
    const { f, groupA, groupB } = await setup();
    const result = await addGroupSupervisionSession(supervisionInput(f.a.supervisorId, groupA, []));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.supervisionSessions).toEqual([]);

    expect(await idsOf(groupA)).toEqual([]);
    expect(await idsOf(groupB)).toEqual([]);
    expect((await getSupervisionSessions()).filter((s) => s.kind === "group")).toHaveLength(1);
  });

  it("nimmt die Supervision aus der Gruppe, wenn ihre einzige Doppelstunde gelöscht wird", async () => {
    const { f, groupA, sessionA } = await setup();
    await addSupervision(f.a.supervisorId, groupA, [sessionA]);

    const result = await deleteGroupSession({ id: sessionA, groupId: groupA });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.supervisionSessions).toEqual([]);
    expect((await getSupervisionSessions()).filter((s) => s.kind === "group")).toHaveLength(1);
  });

  it("zeigt keine Einzelsupervision in der Gruppe", async () => {
    const { groupA } = await setup();
    expect(await idsOf(groupA)).toEqual([]);
  });
});
