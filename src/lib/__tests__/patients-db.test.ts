// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture, countRows } from "./helpers/fixtures";

vi.mock("../auth", () => ({ auth: vi.fn() }));
import { deletePatient } from "../db/patients";

describe.skipIf(!TEST_DATABASE_URL)("Patient:innen löschen", () => {
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

  // Die Supervision der Fixture bespricht nur diese Patient:in. Sie hat stattgefunden und bleibt mit voller Dauer (#40).
  it("löscht Patient:in samt Sitzungen, Verknüpfungen und Anteil, die Supervision bleibt mit voller Dauer", async () => {
    const { db, f } = await setup();

    await deletePatient(db, f.a.userId, f.a.patientId);

    expect(await countRows(db, "patients", "WHERE id = $1", [f.a.patientId])).toBe(0);
    expect(await countRows(db, "therapy_sessions", "WHERE patient_id = $1", [f.a.patientId])).toBe(0);
    expect(await countRows(db, "supervision_therapy_links", "WHERE supervision_id = $1", [f.a.supervisionId])).toBe(0);
    expect(await countRows(db, "supervision_cases", "WHERE patient_id = $1", [f.a.patientId])).toBe(0);
    const { rows } = await db.query("SELECT duration_minutes FROM supervision_sessions WHERE id = $1", [f.a.supervisionId]);
    expect(rows).toEqual([{ duration_minutes: 60 }]);
    // Der andere Account ist unberührt.
    expect(await countRows(db, "therapy_sessions", "WHERE patient_id = $1", [f.b.patientId])).toBe(1);
    expect(await countRows(db, "supervision_sessions", "WHERE id = $1", [f.b.supervisionId])).toBe(1);
  });

  it("weist fremde Patient:innen zurück und löscht nichts", async () => {
    const { db, f } = await setup();

    await expect(deletePatient(db, f.a.userId, f.b.patientId)).rejects.toThrow("Patient:in nicht gefunden");

    expect(await countRows(db, "patients", "WHERE id = $1", [f.b.patientId])).toBe(1);
    expect(await countRows(db, "therapy_sessions", "WHERE patient_id = $1", [f.b.patientId])).toBe(1);
    expect(await countRows(db, "supervision_cases", "WHERE patient_id = $1", [f.b.patientId])).toBe(1);
  });
});
