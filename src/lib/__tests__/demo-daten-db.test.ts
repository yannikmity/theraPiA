// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import type { Client } from "pg";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { countRows, seedOwnershipFixture } from "./helpers/fixtures";
import { generateDemoData } from "../demo/demo-daten.mjs";
import { checkDemoReferences, insertDemoData } from "../demo/demo-daten-db.mjs";
import { loadUserData } from "../db/user-data";
import { calculateOverallRatio, calculatePatientRatio, getUnsupervisedSessions, groupSessionCounts } from "../calculations";
import { standardRegelwerk } from "../ausbildungsregeln/resolve";
import { deleteOwnAccount } from "../services/account-deletion";

const STICHTAG = "2026-09-28";
const PASSWORD = "sicheres-passwort";
// Alle Tabellen mit user_id, in die der Schreibweg schreibt.
const ACCOUNT_TABELLEN = [
  "patients",
  "supervisors",
  "therapy_sessions",
  "supervision_sessions",
  "groups",
  "group_sessions",
  "financial_settings",
];

describe("checkDemoReferences", () => {
  it("akzeptiert die generierten Beispieldaten", () => {
    expect(() => checkDemoReferences(generateDemoData(STICHTAG))).not.toThrow();
  });

  it("meldet doppelte Schlüssel und Verweise ins Leere, bevor etwas geschrieben wird", () => {
    const data = generateDemoData(STICHTAG);
    const sv = data.supervisionSessions[0];
    expect(() => checkDemoReferences({ ...data, patients: [...data.patients, data.patients[0]] })).toThrow(
      "Beispieldaten: Patient:in „A“ doppelt"
    );
    expect(() => checkDemoReferences({ ...data, therapySessions: [{ ...data.therapySessions[0], patient: "X" }] })).toThrow(
      /verweist auf unbekannte Patient:in „X“/
    );
    expect(() => checkDemoReferences({ ...data, groupSessions: [{ ...data.groupSessions[0], group: "g9" }] })).toThrow(
      /verweist auf unbekannte Gruppe „g9“/
    );
    expect(() => checkDemoReferences({ ...data, supervisionSessions: [{ ...sv, supervisor: "s9" }] })).toThrow(
      /verweist auf unbekannte Supervisor:in „s9“/
    );
    expect(() => checkDemoReferences({ ...data, supervisionSessions: [{ ...sv, therapySessions: ["fehlt"] }] })).toThrow(
      /verweist auf unbekannte Sitzung „fehlt“/
    );
  });
});

describe.skipIf(!TEST_DATABASE_URL)("insertDemoData", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  async function setup() {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    // Kosten 4 statt 12: nur für die Testgeschwindigkeit, bcrypt.compare liest die Kosten aus dem Hash.
    const hash = await bcrypt.hash(PASSWORD, 4);
    const { rows } = await t.client.query(
      "INSERT INTO users (email, name, password_hash, is_demo) VALUES ('demo@example.com', 'PiA Demo', $1, true) RETURNING id",
      [hash]
    );
    return { db: t.client, f, userId: rows[0].id as string };
  }

  async function zaehle(db: Client, userId: string): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const tabelle of ACCOUNT_TABELLEN) out[tabelle] = await countRows(db, tabelle, "WHERE user_id = $1", [userId]);
    return out;
  }

  async function verknuepfungen(db: Client) {
    const { rows } = await db.query(
      `SELECT (SELECT count(*)::int FROM supervision_therapy_links) AS therapie,
              (SELECT count(*)::int FROM supervision_group_session_links) AS gruppe`
    );
    return rows[0];
  }

  it("schreibt alle Beispieldaten für genau diesen Account – die App liest und rechnet sie wie erzeugt", async () => {
    const { db, f, userId } = await setup();
    const fremd = await zaehle(db, f.a.userId);

    await insertDemoData(db, userId, generateDemoData(STICHTAG));

    expect(await zaehle(db, userId)).toEqual({
      patients: 5,
      supervisors: 2,
      therapy_sessions: 159,
      supervision_sessions: 39,
      groups: 1,
      group_sessions: 32,
      financial_settings: 1,
    });
    expect(await zaehle(db, f.a.userId)).toEqual(fremd);

    const geladen = await loadUserData(db, userId);
    expect(geladen.patients.map((p) => p.chiffre)).toEqual(["A-1041", "B-2317", "C-3082", "D-4265", "E-5119"]);
    expect(geladen.financialSettings).toEqual({ incomePerHour: 70 });
    expect(geladen.supervisionSessions.reduce((n, s) => n + s.linkedTherapySessionIds.length, 0)).toBe(144);
    expect(geladen.supervisionSessions.reduce((n, s) => n + s.linkedGroupSessionIds.length, 0)).toBe(23);
    const regeln = standardRegelwerk().regeln;
    expect(calculateOverallRatio(geladen.therapySessions, geladen.supervisionSessions, regeln).ratio).toBe(2.7);
    const status = Object.fromEntries(
      geladen.patients.map((p) => [p.chiffre, calculatePatientRatio(p, geladen.therapySessions, geladen.supervisionSessions, regeln).status])
    );
    expect(status).toEqual({ "A-1041": "ok", "B-2317": "ok", "C-3082": "ok", "D-4265": "warning", "E-5119": "critical" });
    expect(getUnsupervisedSessions(geladen.therapySessions, geladen.supervisionSessions)).toHaveLength(15);
    expect(groupSessionCounts(geladen.groupSessions).ambulanzzeitCount).toBe(23);
    const geplant = await db.query("SELECT planned_sessions_per_week FROM financial_settings WHERE user_id = $1", [userId]);
    expect(geplant.rows).toEqual([{ planned_sessions_per_week: null }]);
  });

  it("vergibt je Aufruf eigene IDs – zwei Accounts können dieselben Beispieldaten bekommen", async () => {
    const { db, f, userId } = await setup();
    const data = generateDemoData(STICHTAG);
    await insertDemoData(db, userId, data);
    await insertDemoData(db, f.b.userId, data);
    // Account B hatte aus der Fixture schon eine Sitzung.
    expect(await countRows(db, "therapy_sessions", "WHERE user_id = $1", [f.b.userId])).toBe(160);
    expect(await countRows(db, "therapy_sessions", "WHERE user_id = $1", [userId])).toBe(159);
  });

  it("schreibt bei einem Verweis ins Leere nichts", async () => {
    const { db, userId } = await setup();
    const data = generateDemoData(STICHTAG);
    const kaputt = { ...data, therapySessions: [...data.therapySessions, { ...data.therapySessions[0], key: "neu", patient: "X" }] };
    await expect(insertDemoData(db, userId, kaputt)).rejects.toThrow(/unbekannte Patient:in „X“/);
    expect(await zaehle(db, userId)).toEqual(Object.fromEntries(ACCOUNT_TABELLEN.map((t) => [t, 0])));
  });

  it("verschwindet mit dem Account vollständig – Löschen wie bei jedem Account (Fremdschlüssel)", async () => {
    const { db, f, userId } = await setup();
    await insertDemoData(db, userId, generateDemoData(STICHTAG));
    // Die Fixture hat je Account eine Therapie-Verknüpfung und keine Doppelstunden-Verknüpfung.
    expect(await verknuepfungen(db)).toEqual({ therapie: 146, gruppe: 23 });
    const fremd = await zaehle(db, f.a.userId);

    expect(await deleteOwnAccount(db, userId, PASSWORD)).toEqual({ ok: true });

    expect(await zaehle(db, userId)).toEqual(Object.fromEntries(ACCOUNT_TABELLEN.map((t) => [t, 0])));
    expect(await verknuepfungen(db)).toEqual({ therapie: 2, gruppe: 0 });
    expect(await zaehle(db, f.a.userId)).toEqual(fremd);
  });
});
