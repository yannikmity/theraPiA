// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture, countRows } from "./helpers/fixtures";
import { loadUserData, loadCreatedInvitations } from "../db/user-data";
import { createInvitation } from "../services/invitations";
import { loadNachweis, loadNachweisPage } from "../services/nachweis";

describe.skipIf(!TEST_DATABASE_URL)("Daten eines Accounts laden", () => {
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

  it("liefert nur die eigenen Daten – von Account B nichts", async () => {
    const { db, f } = await setup();
    const data = await loadUserData(db, f.a.userId);
    expect(data.account).toMatchObject({ id: f.a.userId, email: "a@example.com", name: "PiA A", role: "pia" });
    expect(data.patients.map((p) => p.id)).toEqual([f.a.patientId]);
    expect(data.supervisors.map((s) => s.id)).toEqual([f.a.supervisorId]);
    expect(data.therapySessions.map((s) => s.id)).toEqual([f.a.therapySessionId]);
    expect(data.supervisionSessions.map((s) => s.id)).toEqual([f.a.supervisionId]);
    expect(data.groups.map((g) => g.id)).toEqual([f.a.groupId]);
    expect(data.groupSessions.map((g) => g.id)).toEqual([f.a.groupSessionId]);
  });

  it("enthält die Verknüpfungen der Supervisionen und DATE-Spalten als YYYY-MM-DD", async () => {
    const { db, f } = await setup();
    const data = await loadUserData(db, f.a.userId);
    expect(data.supervisionSessions[0].linkedTherapySessionIds).toEqual([f.a.therapySessionId]);
    expect(data.supervisionSessions[0].linkedGroupSessionIds).toEqual([]);
    expect(data.therapySessions[0].date).toBe("2026-01-02");
    expect(data.patients[0].startDate).toBe("2026-01-01");
    expect(data.groupSessions[0].date).toBe("2026-01-03");
  });

  it("liefert das Setting der Supervision (Einzel/Gruppe)", async () => {
    const { db, f } = await setup();
    await db.query("UPDATE supervision_sessions SET setting = 'gruppe' WHERE id = $1", [f.a.supervisionId]);
    const data = await loadUserData(db, f.a.userId);
    expect(data.supervisionSessions[0].setting).toBe("gruppe");
  });

  it("liefert Verknüpfungen nur auf eigene Sitzungen – fremde Ziele fallen weg (Defense in Depth)", async () => {
    const { db, f } = await setup();
    // Direkt in die Tabellen geschrieben, an der Besitzprüfung der App vorbei. Die Sitzung von B gehört höchstens einer
    // Supervision (Migration 010) – Bs eigenen Link vorher entfernen.
    await db.query("DELETE FROM supervision_therapy_links WHERE supervision_id = $1", [f.b.supervisionId]);
    await db.query("INSERT INTO supervision_therapy_links (supervision_id, therapy_session_id) VALUES ($1, $2)", [
      f.a.supervisionId,
      f.b.therapySessionId,
    ]);
    await db.query("INSERT INTO supervision_group_session_links (supervision_id, group_session_id) VALUES ($1, $2), ($1, $3)", [
      f.a.supervisionId,
      f.a.groupSessionId,
      f.b.groupSessionId,
    ]);
    const data = await loadUserData(db, f.a.userId);
    expect(data.supervisionSessions[0].linkedTherapySessionIds).toEqual([f.a.therapySessionId]);
    expect(data.supervisionSessions[0].linkedGroupSessionIds).toEqual([f.a.groupSessionId]);
  });

  it("liefert DECIMAL-Spalten als Zahlen", async () => {
    const { db, f } = await setup();
    await db.query("UPDATE supervisors SET cost_per_hour = 85.5 WHERE id = $1", [f.a.supervisorId]);
    await db.query("INSERT INTO financial_settings (user_id, income_per_hour) VALUES ($1, 40)", [f.a.userId]);
    const data = await loadUserData(db, f.a.userId);
    expect(data.supervisors[0].costPerHour).toBe(85.5);
    expect(data.financialSettings.incomePerHour).toBe(40);
  });

  it("nimmt ohne Finanz-Einstellungen 0 an und legt keine Zeile an", async () => {
    const { db, f } = await setup();
    const data = await loadUserData(db, f.a.userId);
    expect(data.financialSettings).toEqual({ incomePerHour: 0, plannedSessionsPerWeek: null });
    expect(await countRows(db, "financial_settings", "WHERE user_id = $1", [f.a.userId])).toBe(0);
  });

  it("liefert die Wochenplanung: 12 und 0 wie gespeichert, NULL (automatisch) als null (#42)", async () => {
    const { db, f } = await setup();
    await db.query("INSERT INTO financial_settings (user_id, income_per_hour) VALUES ($1, 40)", [f.a.userId]);
    expect((await loadUserData(db, f.a.userId)).financialSettings).toEqual({ incomePerHour: 40, plannedSessionsPerWeek: null });
    for (const planned of [12, 0]) {
      await db.query("UPDATE financial_settings SET planned_sessions_per_week = $2 WHERE user_id = $1", [f.a.userId, planned]);
      expect((await loadUserData(db, f.a.userId)).financialSettings).toEqual({ incomePerHour: 40, plannedSessionsPerWeek: planned });
    }
  });

  it("gibt keinen Passwort-Hash heraus", async () => {
    const { db, f } = await setup();
    await db.query("UPDATE users SET password_hash = 'geheim' WHERE id = $1", [f.a.userId]);
    const data = await loadUserData(db, f.a.userId);
    expect(JSON.stringify(data)).not.toContain("geheim");
    expect(Object.keys(data.account).sort()).toEqual(["createdAt", "email", "id", "name", "role"]);
  });

  it("liefert Patient:innen natürlich nach Chiffre sortiert: A-2 vor A-10", async () => {
    const { db, f } = await setup();
    for (const chiffre of ["A-10", "A-2"]) {
      await db.query("INSERT INTO patients (user_id, chiffre, therapy_type, start_date) VALUES ($1, $2, 'kurzzeittherapie', '2026-01-01')", [f.a.userId, chiffre]);
    }
    const data = await loadUserData(db, f.a.userId);
    expect(data.patients.map((p) => p.chiffre)).toEqual(["A-1", "A-2", "A-10"]);
  });

  it("liefert Supervisor:innen und Gruppen natürlich nach Name sortiert: 2 vor 10 (#51)", async () => {
    const { db, f } = await setup();
    for (const name of ["Supervision 10", "Supervision 2"]) {
      await db.query("INSERT INTO supervisors (user_id, name) VALUES ($1, $2)", [f.a.userId, name]);
    }
    for (const name of ["Gruppe 10", "Gruppe 2"]) {
      await db.query("INSERT INTO groups (user_id, name, start_date, planned_session_count) VALUES ($1, $2, '2026-01-01', 10)", [f.a.userId, name]);
    }
    const data = await loadUserData(db, f.a.userId);
    expect(data.supervisors.map((s) => s.name)).toEqual(["Supervision 2", "Supervision 10", "Supervision A"]);
    expect(data.groups.map((g) => g.name)).toEqual(["Gruppe 2", "Gruppe 10", "Gruppe A"]);
  });

  it("wirft NotFoundError für einen unbekannten Account", async () => {
    const { db } = await setup();
    await expect(loadUserData(db, "00000000-0000-0000-0000-000000000000")).rejects.toThrow("Account nicht gefunden");
  });

  it("liefert nur die selbst erzeugten Einladungen, ohne Token-Hash", async () => {
    const { db, f } = await setup();
    await createInvitation(db, { email: "neu@example.com", role: "pia", createdBy: f.a.userId });
    await createInvitation(db, { email: null, role: "admin", createdBy: f.b.userId });
    const invitations = await loadCreatedInvitations(db, f.a.userId);
    expect(invitations).toHaveLength(1);
    expect(invitations[0]).toMatchObject({ email: "neu@example.com", role: "pia", usedAt: null });
    expect(Object.keys(invitations[0]).sort()).toEqual(["createdAt", "email", "expiresAt", "role", "usedAt"]);
  });

  it("loadNachweis baut den Nachweis aus den eigenen Daten", async () => {
    const { db, f } = await setup();
    const n = await loadNachweis(db, f.a.userId, { from: "2026-01-01", to: "2026-01-31", supervisorId: f.a.supervisorId });
    expect(n.supervisor).toEqual({ id: f.a.supervisorId, name: "Supervision A" });
    expect(n.supervisionSessions.map((s) => s.id)).toEqual([f.a.supervisionId]);
    expect(n.therapySessions.map((s) => s.chiffre)).toEqual(["A-1"]);
    expect(n.groupSessions).toEqual([]);
    expect(n.totals).toMatchObject({ therapyUnits: 1, therapyMinutes: 50, supervisionUnits: 1, supervisionMinutes: 60 });
  });

  it("loadNachweis rechnet mit dem Regelwerk der Person (#8)", async () => {
    const { db, f } = await setup();
    await db.query(
      "INSERT INTO ausbildungsregeln_abweichungen (user_id, verhaeltnis_warnung, verhaeltnis_kritisch) VALUES ($1, 3, 3.5)",
      [f.a.userId]
    );
    const filter = { from: "2026-01-01", to: "2026-01-31", supervisorId: null };
    const a = await loadNachweis(db, f.a.userId, filter);
    expect(a.regeln.verhaeltnisWarnung).toBe(3);
    expect(a.abweichend).toEqual(["verhaeltnisWarnung", "verhaeltnisKritisch"]);
    expect(a.totals.ratio.soll).toBe(3);
    expect((await loadNachweisPage(db, f.b.userId, filter)).nachweis.regeln.verhaeltnisWarnung).toBe(4);
  });

  it("loadNachweis wirft NotFoundError für die vorhandene Supervisor:in von Account B", async () => {
    const { db, f } = await setup();
    await expect(
      loadNachweis(db, f.a.userId, { from: "2026-01-01", to: "2026-01-31", supervisorId: f.b.supervisorId })
    ).rejects.toMatchObject({ name: "NotFoundError" });
  });

  it("loadNachweis zeigt unter einer Supervision nur durchgeführte Doppelstunden (#41)", async () => {
    const { db, f } = await setup();
    const cancelled = (
      await db.query(
        "INSERT INTO group_sessions (user_id, group_id, date, status, child_count) VALUES ($1, $2, '2026-01-10', 'ausgefallen', NULL) RETURNING id",
        [f.a.userId, f.a.groupId]
      )
    ).rows[0].id as string;
    for (const id of [f.a.groupSessionId, cancelled]) {
      await db.query("INSERT INTO supervision_group_session_links (supervision_id, group_session_id) VALUES ($1, $2)", [
        f.a.supervisionId,
        id,
      ]);
    }
    const n = await loadNachweis(db, f.a.userId, { from: "2026-01-01", to: "2026-01-31", supervisorId: null });
    expect(n.supervisionSessions[0].linkedGroupSessions).toEqual([{ date: "2026-01-03", groupName: "Gruppe A" }]);
    expect(n.groupSessions.map((g) => g.id)).toEqual([f.a.groupSessionId]);
    expect(n.totals.groupSessionUnits).toBe(1);
  });

  it("loadNachweisPage liefert Nachweis, Supervisor:innen-Liste und frühestes Datum", async () => {
    const { db, f } = await setup();
    const page = await loadNachweisPage(db, f.a.userId, { from: "2026-01-01", to: "2026-01-31", supervisorId: null });
    expect(page.supervisors).toEqual([{ id: f.a.supervisorId, name: "Supervision A", isActive: true }]);
    expect(page.firstRecordDate).toBe("2026-01-01");
    expect(page.supervisorNotFound).toBe(false);
    expect(page.nachweis.therapySessions.map((s) => s.chiffre)).toEqual(["A-1"]);
  });

  it("loadNachweisPage fällt bei fremder Supervisor:in auf „alle“ zurück und meldet das", async () => {
    const { db, f } = await setup();
    const page = await loadNachweisPage(db, f.a.userId, { from: "2026-01-01", to: "2026-01-31", supervisorId: f.b.supervisorId });
    expect(page.supervisorNotFound).toBe(true);
    expect(page.nachweis.supervisor).toBeNull();
    expect(page.nachweis.supervisionSessions.map((s) => s.id)).toEqual([f.a.supervisionId]);
  });
});
