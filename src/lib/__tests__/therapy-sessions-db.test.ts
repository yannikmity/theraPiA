// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture, countRows } from "./helpers/fixtures";
import { newPatientId, newTherapySessionId } from "@/types";

vi.mock("../auth", () => ({ auth: vi.fn() }));
import { updateTherapySession, deleteTherapySession, insertTherapySession, therapySessionExists } from "../db/therapy-sessions";

describe.skipIf(!TEST_DATABASE_URL)("Therapiesitzungen ändern und löschen", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  async function setup() {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    return { db: t.client, f };
  }

  it("ändert Datum, Dauer, Kategorie und Notiz der eigenen Sitzung", async () => {
    const { db, f } = await setup();

    await updateTherapySession(db, f.a.userId, {
      id: newTherapySessionId(f.a.therapySessionId),
      date: "2026-02-10",
      durationMinutes: 100,
      notes: "Doppelstunde",
      category: "behandlung",
    });

    const { rows } = await db.query(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date, duration_minutes, notes, category, patient_id
       FROM therapy_sessions WHERE id = $1`,
      [f.a.therapySessionId]
    );
    expect(rows[0]).toEqual({
      date: "2026-02-10",
      duration_minutes: 100,
      notes: "Doppelstunde",
      category: "behandlung",
      patient_id: f.a.patientId,
    });
  });

  it("weist fremde Sitzungen beim Ändern zurück und ändert nichts", async () => {
    const { db, f } = await setup();

    await expect(
      updateTherapySession(db, f.a.userId, {
        id: newTherapySessionId(f.b.therapySessionId),
        date: "2026-02-10",
        durationMinutes: 100,
        notes: "manipuliert",
        category: "behandlung",
      })
    ).rejects.toThrow("Therapiesitzung nicht gefunden");

    const { rows } = await db.query("SELECT duration_minutes, notes FROM therapy_sessions WHERE id = $1", [
      f.b.therapySessionId,
    ]);
    expect(rows[0]).toEqual({ duration_minutes: 50, notes: "Erstgespräch" });
  });

  it("löscht die eigene Sitzung samt Supervisions-Verknüpfung, die Supervision bleibt", async () => {
    const { db, f } = await setup();

    await deleteTherapySession(db, f.a.userId, f.a.therapySessionId);

    expect(await countRows(db, "therapy_sessions", "WHERE id = $1", [f.a.therapySessionId])).toBe(0);
    expect(await countRows(db, "supervision_therapy_links", "WHERE therapy_session_id = $1", [f.a.therapySessionId])).toBe(0);
    expect(await countRows(db, "supervision_sessions", "WHERE id = $1", [f.a.supervisionId])).toBe(1);
  });

  it("weist fremde Sitzungen beim Löschen zurück", async () => {
    const { db, f } = await setup();

    await expect(deleteTherapySession(db, f.a.userId, f.b.therapySessionId)).rejects.toThrow(
      "Therapiesitzung nicht gefunden"
    );

    expect(await countRows(db, "therapy_sessions", "WHERE id = $1", [f.b.therapySessionId])).toBe(1);
    expect(await countRows(db, "supervision_therapy_links", "WHERE therapy_session_id = $1", [f.b.therapySessionId])).toBe(1);
  });

  it("fügt eine Sitzung für die eigene Patient:in ein und findet sie danach am Tag", async () => {
    const { db, f } = await setup();
    expect(await therapySessionExists(db, f.a.userId, f.a.patientId, "2026-01-09")).toBe(false);

    await insertTherapySession(db, f.a.userId, {
      id: newTherapySessionId(randomUUID()),
      patientId: newPatientId(f.a.patientId),
      date: "2026-01-09",
      durationMinutes: 50,
      notes: "",
      category: "behandlung",
    });

    expect(await therapySessionExists(db, f.a.userId, f.a.patientId, "2026-01-09")).toBe(true);
    expect(await countRows(db, "therapy_sessions", "WHERE patient_id = $1", [f.a.patientId])).toBe(2);
  });

  it("weist fremde Patient:innen beim Einfügen zurück und sieht fremde Sitzungen nicht", async () => {
    const { db, f } = await setup();

    await expect(
      insertTherapySession(db, f.a.userId, {
        id: newTherapySessionId(randomUUID()),
        patientId: newPatientId(f.b.patientId),
        date: "2026-01-09",
        durationMinutes: 50,
        notes: "",
        category: "behandlung",
      })
    ).rejects.toThrow("Patient:in nicht gefunden");

    expect(await countRows(db, "therapy_sessions", "WHERE patient_id = $1", [f.b.patientId])).toBe(1);
    // Account B hat am 2026-01-02 eine Sitzung – für A existiert sie nicht.
    expect(await therapySessionExists(db, f.a.userId, f.b.patientId, "2026-01-02")).toBe(false);
  });

  it("setzt updated_at beim Ändern neu", async () => {
    const { db, f } = await setup();
    await db.query("UPDATE therapy_sessions SET updated_at = '2020-01-01T00:00:00Z' WHERE id = $1", [f.a.therapySessionId]);
    await updateTherapySession(db, f.a.userId, {
      id: newTherapySessionId(f.a.therapySessionId),
      date: "2026-02-10",
      durationMinutes: 50,
      notes: "",
      category: "behandlung",
    });
    const { rows } = await db.query(
      "SELECT updated_at > '2020-01-02T00:00:00Z'::timestamptz AS bumped FROM therapy_sessions WHERE id = $1",
      [f.a.therapySessionId]
    );
    expect(rows[0].bumped).toBe(true);
  });
});
