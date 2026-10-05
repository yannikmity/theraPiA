// @vitest-environment node
// Server Actions Ändern/Löschen: Sitzung, Validierung und Besitz laufen über createAction – hier einmal komplett
// durch, mit echter Datenbank und ohne NextAuth.
import { describe, it, expect, afterEach, vi } from "vitest";
import type { Client } from "pg";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture, countRows } from "./helpers/fixtures";

const state = vi.hoisted(() => ({ client: undefined as Client | undefined, userId: "" as string | null }));

vi.mock("../auth", () => ({
  auth: async () => (state.userId ? { user: { id: state.userId, role: "pia" }, expires: "" } : null),
}));
vi.mock("../db", () => {
  // Die Nachlade-Funktionen fragen per Promise.all parallel ab; auf der einen Testverbindung werden die
  // Abfragen deshalb nacheinander gestellt (pg warnt sonst vor gleichzeitigen Abfragen auf einem Client).
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

import { updateTherapySession, deleteTherapySession } from "@/app/(app)/patients/[id]/actions";
import { updateSupervisionSessionAction, deleteSupervisionSessionAction } from "@/app/(app)/supervision/actions";

describe.skipIf(!TEST_DATABASE_URL)("Server Actions Ändern/Löschen", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
    state.client = undefined;
  });

  async function setup() {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    state.client = t.client;
    state.userId = f.a.userId;
    return { db: t.client, f };
  }

  const therapyInput = (f: Awaited<ReturnType<typeof setup>>["f"], overrides: Record<string, unknown> = {}) => ({
    id: f.a.therapySessionId,
    patientId: f.a.patientId,
    date: "2026-02-10",
    durationMinutes: 100,
    notes: "geändert",
    category: "behandlung" as const,
    ...overrides,
  });

  const supervisionInput = (f: Awaited<ReturnType<typeof setup>>["f"], overrides: Record<string, unknown> = {}) => ({
    id: f.a.supervisionId,
    supervisorId: f.a.supervisorId,
    date: "2026-02-11",
    durationMinutes: 90,
    kind: "individual" as const,
    setting: "einzel" as const,
    linkedTherapySessionIds: [f.a.therapySessionId],
    linkedGroupSessionIds: [] as string[],
    ...overrides,
  });

  it("ändert die eigene Therapiesitzung und liefert die Seitendaten neu", async () => {
    const { f } = await setup();
    const result = await updateTherapySession(therapyInput(f));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.patient?.id).toBe(f.a.patientId);
    expect(result.data.therapySessions.find((s) => s.id === f.a.therapySessionId)).toMatchObject({
      date: "2026-02-10",
      durationMinutes: 100,
      notes: "geändert",
    });
  });

  it("weist fremde Therapiesitzungen beim Ändern zurück", async () => {
    const { db, f } = await setup();
    const result = await updateTherapySession(therapyInput(f, { id: f.b.therapySessionId, patientId: f.b.patientId }));
    expect(result).toEqual({ success: false, error: "Therapiesitzung nicht gefunden" });
    const { rows } = await db.query("SELECT notes FROM therapy_sessions WHERE id = $1", [f.b.therapySessionId]);
    expect(rows[0].notes).toBe("Erstgespräch");
  });

  it("meldet fehlende Pflichtfelder je Feld, ohne die Datenbank anzufassen", async () => {
    const { db, f } = await setup();
    const { notes: _weg, ...ohneNotiz } = therapyInput(f);
    void _weg;
    const result = await updateTherapySession(ohneNotiz as Parameters<typeof updateTherapySession>[0]);
    expect(result.success).toBe(false);
    if (!result.success) expect(Object.keys(result.fieldErrors ?? {})).toEqual(["notes"]);
    const { rows } = await db.query("SELECT duration_minutes FROM therapy_sessions WHERE id = $1", [f.a.therapySessionId]);
    expect(rows[0].duration_minutes).toBe(50);
  });

  it("löscht die eigene Therapiesitzung, fremde nicht", async () => {
    const { db, f } = await setup();
    expect((await deleteTherapySession({ id: f.a.therapySessionId, patientId: f.a.patientId })).success).toBe(true);
    expect(await countRows(db, "therapy_sessions", "WHERE id = $1", [f.a.therapySessionId])).toBe(0);
    expect(await deleteTherapySession({ id: f.b.therapySessionId, patientId: f.b.patientId })).toEqual({
      success: false,
      error: "Therapiesitzung nicht gefunden",
    });
    expect(await countRows(db, "therapy_sessions", "WHERE id = $1", [f.b.therapySessionId])).toBe(1);
  });

  it("ändert die eigene Supervision samt Verknüpfungen", async () => {
    const { db, f } = await setup();
    const second = (
      await db.query(
        "INSERT INTO therapy_sessions (user_id, patient_id, date, duration_minutes) VALUES ($1, $2, '2026-01-10', 50) RETURNING id",
        [f.a.userId, f.a.patientId]
      )
    ).rows[0].id as string;
    const result = await updateSupervisionSessionAction(supervisionInput(f, { linkedTherapySessionIds: [second] }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.supervisionSessions.find((s) => s.id === f.a.supervisionId)?.linkedTherapySessionIds).toEqual([second]);
  });

  it("weist eine fremde Supervisor:in beim Ändern zurück", async () => {
    const { db, f } = await setup();
    const result = await updateSupervisionSessionAction(supervisionInput(f, { supervisorId: f.b.supervisorId }));
    expect(result).toEqual({ success: false, error: "Supervisor:in nicht gefunden" });
    const { rows } = await db.query("SELECT supervisor_id FROM supervision_sessions WHERE id = $1", [f.a.supervisionId]);
    expect(rows[0].supervisor_id).toBe(f.a.supervisorId);
  });

  it("weist fremde Supervisionen beim Ändern zurück und lässt sie unverändert", async () => {
    const { db, f } = await setup();
    const result = await updateSupervisionSessionAction(supervisionInput(f, { id: f.b.supervisionId }));
    expect(result).toEqual({ success: false, error: "Supervisionssitzung nicht gefunden" });
    const { rows } = await db.query(
      "SELECT to_char(date, 'YYYY-MM-DD') AS date, duration_minutes, supervisor_id FROM supervision_sessions WHERE id = $1",
      [f.b.supervisionId]
    );
    expect(rows[0]).toEqual({ date: "2026-01-04", duration_minutes: 60, supervisor_id: f.b.supervisorId });
    const links = await db.query("SELECT therapy_session_id FROM supervision_therapy_links WHERE supervision_id = $1", [
      f.b.supervisionId,
    ]);
    expect(links.rows).toEqual([{ therapy_session_id: f.b.therapySessionId }]);
  });

  it("weist eine fremde Therapiesitzung als Verknüpfung zurück, ohne Verknüpfungen zu schreiben", async () => {
    const { db, f } = await setup();
    const result = await updateSupervisionSessionAction(
      supervisionInput(f, { linkedTherapySessionIds: [f.b.therapySessionId] })
    );
    expect(result).toEqual({ success: false, error: "Therapiesitzung nicht gefunden" });
    expect(
      await countRows(db, "supervision_therapy_links", "WHERE therapy_session_id = $1", [f.b.therapySessionId])
    ).toBe(1);
    const links = await db.query("SELECT therapy_session_id FROM supervision_therapy_links WHERE supervision_id = $1", [
      f.a.supervisionId,
    ]);
    expect(links.rows).toEqual([{ therapy_session_id: f.a.therapySessionId }]);
  });

  it("lehnt Doppelstunden an einer Einzelsupervision schon in der Validierung ab", async () => {
    const { f } = await setup();
    const result = await updateSupervisionSessionAction(supervisionInput(f, { linkedGroupSessionIds: [f.a.groupSessionId] }));
    expect(result.success).toBe(false);
    if (!result.success) expect(Object.keys(result.fieldErrors ?? {})).toEqual(["linkedGroupSessionIds"]);
  });

  it("löscht die eigene Supervision, fremde nicht", async () => {
    const { db, f } = await setup();
    expect((await deleteSupervisionSessionAction({ id: f.a.supervisionId })).success).toBe(true);
    expect(await countRows(db, "supervision_sessions", "WHERE id = $1", [f.a.supervisionId])).toBe(0);
    expect(await deleteSupervisionSessionAction({ id: f.b.supervisionId })).toEqual({
      success: false,
      error: "Supervisionssitzung nicht gefunden",
    });
    expect(await countRows(db, "supervision_sessions", "WHERE id = $1", [f.b.supervisionId])).toBe(1);
  });

  it("lehnt ohne Sitzung ab, bevor irgendetwas passiert", async () => {
    const { db, f } = await setup();
    state.userId = null;
    expect(await deleteTherapySession({ id: f.a.therapySessionId, patientId: f.a.patientId })).toEqual({
      success: false,
      error: "Nicht angemeldet",
    });
    expect(await countRows(db, "therapy_sessions", "WHERE id = $1", [f.a.therapySessionId])).toBe(1);
  });
});
