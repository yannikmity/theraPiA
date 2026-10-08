// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import type { Client } from "pg";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture, countRows } from "./helpers/fixtures";

vi.mock("../auth", () => ({ auth: vi.fn() }));
import { insertSupervisionSession, updateSupervisionSession } from "../db/supervision-sessions";
import { deleteTherapySession } from "../db/therapy-sessions";
import { deletePatient } from "../db/patients";
import { loadUserData } from "../db/user-data";
import { supervisionHoursForPatient } from "../calculations";
import {
  newPatientId,
  newSupervisionSessionId,
  newSupervisorId,
  newTherapySessionId,
  type PatientId,
  type SupervisionSession,
} from "@/types";

// Anteil je Fall (#40): Die Dauer einer Supervision je besprochener Patient:in ist gespeichert. Löschen einer Sitzung
// oder eines Falls verteilt sie nicht auf andere Fälle um.
describe.skipIf(!TEST_DATABASE_URL)("Supervision: Anteil je Fall", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  // Account A der Fixture plus Patient:in B mit einer Sitzung; eine Supervision bespricht je eine Sitzung von A und B,
  // 25 Min je Fall.
  async function setup() {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const db = t.client;
    const f = await seedOwnershipFixture(db);
    const one = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0];
    const patientB = await one(
      "INSERT INTO patients (user_id, chiffre, therapy_type, start_date) VALUES ($1, 'A-2', 'kurzzeittherapie', '2026-01-01') RETURNING id",
      [f.a.userId]
    );
    const sessionB = await one(
      "INSERT INTO therapy_sessions (user_id, patient_id, date, duration_minutes) VALUES ($1, $2, '2026-01-05', 50) RETURNING id",
      [f.a.userId, patientB.id]
    );
    const A = newPatientId(f.a.patientId);
    const B = newPatientId(patientB.id);
    const supervision: SupervisionSession = {
      id: newSupervisionSessionId(crypto.randomUUID()),
      supervisorId: newSupervisorId(f.a.supervisorId),
      date: "2026-01-20",
      durationMinutes: 50,
      kind: "individual",
      setting: "einzel",
      linkedTherapySessionIds: [newTherapySessionId(f.a.therapySessionId), newTherapySessionId(sessionB.id)],
      linkedGroupSessionIds: [],
      caseShares: [
        { patientId: A, minutes: 25 },
        { patientId: B, minutes: 25 },
      ],
    };
    // Die Supervision der Fixture bespricht nur A; ohne sie bleibt die Rechnung übersichtlich.
    await db.query("DELETE FROM supervision_sessions WHERE id = $1", [f.a.supervisionId]);
    await insertSupervisionSession(db, f.a.userId, supervision);
    return { db, f, A, B, sessionB: sessionB.id as string, supervision };
  }

  async function stand(db: Client, userId: string, supervisionId: string, A: PatientId, B: PatientId) {
    const data = await loadUserData(db, userId);
    const sv = data.supervisionSessions.find((s) => s.id === supervisionId);
    return {
      a: supervisionHoursForPatient(data.supervisionSessions, A),
      b: supervisionHoursForPatient(data.supervisionSessions, B),
      gesamt: sv?.durationMinutes,
      summeAnteile: sv?.caseShares.reduce((sum, c) => sum + c.minutes, 0),
    };
  }

  it("speichert die Anteile und liest sie zurück", async () => {
    const { db, f, A, B, supervision } = await setup();
    expect(await stand(db, f.a.userId, supervision.id, A, B)).toEqual({ a: 0.5, b: 0.5, gesamt: 50, summeAnteile: 50 });
  });

  it("Löschen der letzten verknüpften Sitzung von A ändert Bs Anrechnung nicht", async () => {
    const { db, f, A, B, supervision } = await setup();
    await deleteTherapySession(db, f.a.userId, f.a.therapySessionId);
    expect(await countRows(db, "supervision_therapy_links", "WHERE supervision_id = $1", [supervision.id])).toBe(1);
    // Früher: B bekam 1,0 (die ganze Supervision). A behält seinen Anteil, die Gesamtdauer bleibt.
    expect(await stand(db, f.a.userId, supervision.id, A, B)).toEqual({ a: 0.5, b: 0.5, gesamt: 50, summeAnteile: 50 });
  });

  it("Löschen des ganzen Falls A ändert Bs Anrechnung nicht; die Gesamtdauer sinkt um As Anteil", async () => {
    const { db, f, A, B, supervision } = await setup();
    await deletePatient(db, f.a.userId, A);
    expect(await stand(db, f.a.userId, supervision.id, A, B)).toEqual({ a: 0, b: 0.5, gesamt: 25, summeAnteile: 25 });
  });

  it("Löschen des einzigen Falls einer Supervision löscht sie mit, andere bleiben", async () => {
    const { db, f, A, B, supervision } = await setup();
    await deletePatient(db, f.a.userId, A);
    await deletePatient(db, f.a.userId, B);
    expect(await countRows(db, "supervision_sessions", "WHERE id = $1", [supervision.id])).toBe(0);
    expect(await countRows(db, "supervision_sessions", "WHERE id = $1", [f.b.supervisionId])).toBe(1);
  });

  it("Supervisionen ohne Anteil bleiben beim Löschen einer Patient:in unverändert", async () => {
    const { db, f, A, supervision } = await setup();
    const ohne = { ...supervision, id: newSupervisionSessionId(crypto.randomUUID()), linkedTherapySessionIds: [], caseShares: [] };
    await insertSupervisionSession(db, f.a.userId, ohne);
    await deletePatient(db, f.a.userId, A);
    const { rows } = await db.query("SELECT duration_minutes FROM supervision_sessions WHERE id = $1", [ohne.id]);
    expect(rows).toEqual([{ duration_minutes: 50 }]);
  });

  it("Bearbeiten ersetzt die Anteile; ein Fall ohne Sitzung darf seinen Anteil behalten", async () => {
    const { db, f, A, B, sessionB, supervision } = await setup();
    await updateSupervisionSession(db, f.a.userId, {
      ...supervision,
      durationMinutes: 70,
      linkedTherapySessionIds: [newTherapySessionId(sessionB)],
      caseShares: [
        { patientId: A, minutes: 20 },
        { patientId: B, minutes: 50 },
      ],
    });
    expect(await stand(db, f.a.userId, supervision.id, A, B)).toEqual({ a: 0.4, b: 1, gesamt: 70, summeAnteile: 70 });
  });

  it("weist fehlende, fremde und nicht aufgehende Anteile zurück, bevor etwas geschrieben wird", async () => {
    const { db, f, A, B, supervision } = await setup();
    const neu = () => ({ ...supervision, id: newSupervisionSessionId(crypto.randomUUID()) });
    // Sitzung von B verknüpft, aber kein Anteil für B
    await expect(
      insertSupervisionSession(db, f.a.userId, { ...neu(), durationMinutes: 25, caseShares: [{ patientId: A, minutes: 25 }] })
    ).rejects.toThrow("Für jede besprochene Patient:in eine Dauer angeben");
    // Anteil für eine Patient:in eines anderen Accounts
    await expect(
      insertSupervisionSession(db, f.a.userId, {
        ...neu(),
        durationMinutes: 75,
        caseShares: [...supervision.caseShares, { patientId: newPatientId(f.b.patientId), minutes: 25 }],
      })
    ).rejects.toThrow("Patient:in nicht gefunden");
    // Summe ≠ Gesamtdauer
    await expect(insertSupervisionSession(db, f.a.userId, { ...neu(), durationMinutes: 60 })).rejects.toThrow(
      "Die Gesamtdauer muss der Summe der Dauern je Patient:in entsprechen"
    );
    expect(await countRows(db, "supervision_sessions", "WHERE user_id = $1", [f.a.userId])).toBe(1);
    expect(await stand(db, f.a.userId, supervision.id, A, B)).toEqual({ a: 0.5, b: 0.5, gesamt: 50, summeAnteile: 50 });
  });
});
