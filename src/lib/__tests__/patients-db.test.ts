// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture, countRows } from "./helpers/fixtures";

vi.mock("../auth", () => ({ auth: vi.fn() }));
import { deletePatient, updatePatient } from "../db/patients";
import { loadUserData } from "../db/user-data";
import { supervisionsCsv, therapySessionsCsv } from "../export/csv-files";
import { buildNachweis } from "../nachweis";
import { standardRegelwerk } from "../ausbildungsregeln/resolve";
import { ValidationError, NotFoundError } from "../errors";
import type { Db } from "../db";

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

describe.skipIf(!TEST_DATABASE_URL)("Chiffre umbenennen (#74)", () => {
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

  // Aktueller Datensatz der Patient:in mit neuer Chiffre – alle anderen Felder bleiben, wie sie sind.
  async function umbenannt(db: Db, userId: string, patientId: string, chiffre: string) {
    const patient = (await loadUserData(db, userId)).patients.find((p) => p.id === patientId)!;
    return { ...patient, chiffre };
  }

  it("ändert die Chiffre; Sitzungen, Supervisionsbezug, CSV-Exporte und Nachweis zeigen danach den neuen Wert", async () => {
    const { db, f } = await setup();

    await updatePatient(db, f.a.userId, await umbenannt(db, f.a.userId, f.a.patientId, "A-neu"));

    const data = await loadUserData(db, f.a.userId);
    expect(data.patients.map((p) => [p.id, p.chiffre])).toEqual([[f.a.patientId, "A-neu"]]);
    // Sitzung, Verknüpfung und Anteil hängen an der ID und bleiben erhalten.
    expect(data.therapySessions.map((s) => s.patientId)).toEqual([f.a.patientId]);
    expect(data.supervisionSessions[0].linkedTherapySessionIds).toEqual([f.a.therapySessionId]);
    expect(data.supervisionSessions[0].caseShares).toEqual([{ patientId: f.a.patientId, minutes: 60 }]);
    for (const csv of [therapySessionsCsv(data), supervisionsCsv(data)]) {
      expect(csv).toContain("A-neu");
      expect(csv).not.toContain("A-1");
    }
    const nachweis = buildNachweis(data, { from: "2026-01-01", to: "2026-12-31", supervisorId: null }, standardRegelwerk());
    expect(nachweis.therapySessions.map((r) => r.chiffre)).toEqual(["A-neu"]);
    expect(nachweis.supervisionSessions[0].linkedTherapySessions.map((r) => r.chiffre)).toEqual(["A-neu"]);
    expect(nachweis.supervisionSessions[0].caseShares.map((c) => c.chiffre)).toEqual(["A-neu"]);
  });

  it("lehnt eine im eigenen Account schon vergebene Chiffre mit Meldung am Feld ab und ändert nichts", async () => {
    const { db, f } = await setup();
    const { rows } = await db.query(
      "INSERT INTO patients (user_id, chiffre, therapy_type, start_date) VALUES ($1, 'A-2', 'kurzzeittherapie', '2026-02-01') RETURNING id",
      [f.a.userId]
    );

    const versuch = updatePatient(db, f.a.userId, await umbenannt(db, f.a.userId, rows[0].id, "A-1"));

    await expect(versuch).rejects.toBeInstanceOf(ValidationError);
    await expect(versuch).rejects.toMatchObject({
      message: "Diese Chiffre ist schon vergeben",
      fieldErrors: { chiffre: ["Diese Chiffre ist schon vergeben"] },
    });
    const chiffren = (await loadUserData(db, f.a.userId)).patients.map((p) => p.chiffre).sort();
    expect(chiffren).toEqual(["A-1", "A-2"]);
  });

  it("erlaubt eine Chiffre, die nur ein anderer Account verwendet", async () => {
    const { db, f } = await setup();

    await updatePatient(db, f.a.userId, await umbenannt(db, f.a.userId, f.a.patientId, "B-1"));

    expect((await loadUserData(db, f.a.userId)).patients.map((p) => p.chiffre)).toEqual(["B-1"]);
    expect((await loadUserData(db, f.b.userId)).patients.map((p) => p.chiffre)).toEqual(["B-1"]);
  });

  it("lässt die eigene Chiffre unverändert speichern, ohne Kollision mit sich selbst", async () => {
    const { db, f } = await setup();

    await updatePatient(db, f.a.userId, await umbenannt(db, f.a.userId, f.a.patientId, "A-1"));

    expect((await loadUserData(db, f.a.userId)).patients.map((p) => p.chiffre)).toEqual(["A-1"]);
  });

  it("weist fremde Patient:innen zurück und benennt nichts um", async () => {
    const { db, f } = await setup();
    const fremd = await umbenannt(db, f.b.userId, f.b.patientId, "gekapert");

    await expect(updatePatient(db, f.a.userId, fremd)).rejects.toBeInstanceOf(NotFoundError);

    expect((await loadUserData(db, f.b.userId)).patients.map((p) => p.chiffre)).toEqual(["B-1"]);
  });
});
