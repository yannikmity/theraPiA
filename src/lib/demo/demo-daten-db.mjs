// @ts-check
// Schreibt Beispieldaten (DemoData aus demo-daten.mjs) für einen Account in die Datenbank (#9). Gemeinsamer
// Schreibweg für die Registrierung über eine Demo-Einladung (src/lib/services/registration.ts, in deren Transaktion)
// und die festen Bilddaten des Screenshot-Seeds (scripts/seed-screenshots.mjs). Reines ESM, nur node:crypto –
// das Node-Skript lädt es ohne Build. Je Tabelle eine Anweisung mit unnest statt einer pro Zeile; die IDs entstehen
// vorab, damit Verknüpfungen ohne RETURNING-Reihenfolge auskommen. Die Transaktion bestimmt der Aufrufer.
import { randomUUID } from "node:crypto";

/** @typedef {import("./demo-daten.mjs").DemoData} DemoData */
/** @typedef {{ query: (text: string, params?: unknown[]) => Promise<unknown> }} DemoDb */

/**
 * Prüft Schlüssel und Verweise, bevor etwas geschrieben wird – sonst stünde am Ende ein Fremdschlüsselfehler ohne
 * Hinweis, welche Zeile gemeint ist.
 * @param {DemoData} data
 */
export function checkDemoReferences(data) {
  /**
   * @param {string} art
   * @param {{ key: string }[]} rows
   */
  const schluessel = (art, rows) => {
    /** @type {Set<string>} */
    const keys = new Set();
    for (const row of rows) {
      if (keys.has(row.key)) throw new Error(`Beispieldaten: ${art} „${row.key}“ doppelt`);
      keys.add(row.key);
    }
    return keys;
  };
  const patients = schluessel("Patient:in", data.patients);
  const supervisors = schluessel("Supervisor:in", data.supervisors);
  const sessions = schluessel("Sitzung", data.therapySessions);
  const groups = schluessel("Gruppe", data.groups);
  const groupSessions = schluessel("Doppelstunde", data.groupSessions);
  schluessel("Supervision", data.supervisionSessions);
  /**
   * @param {Set<string>} keys
   * @param {string} art
   * @param {string} key
   * @param {string} wer
   */
  const verweis = (keys, art, key, wer) => {
    if (!keys.has(key)) throw new Error(`Beispieldaten: ${wer} verweist auf unbekannte ${art} „${key}“`);
  };
  for (const s of data.therapySessions) verweis(patients, "Patient:in", s.patient, `Sitzung „${s.key}“`);
  for (const g of data.groupSessions) verweis(groups, "Gruppe", g.group, `Doppelstunde „${g.key}“`);
  for (const sv of data.supervisionSessions) {
    verweis(supervisors, "Supervisor:in", sv.supervisor, `Supervision „${sv.key}“`);
    for (const key of sv.therapySessions) verweis(sessions, "Sitzung", key, `Supervision „${sv.key}“`);
    for (const key of sv.groupSessions) verweis(groupSessions, "Doppelstunde", key, `Supervision „${sv.key}“`);
    for (const c of sv.cases) verweis(patients, "Patient:in", c.patient, `Supervision „${sv.key}“`);
    if (sv.group) verweis(groups, "Gruppe", sv.group, `Supervision „${sv.key}“`);
    if (sv.cases.length > 0 && sv.cases.reduce((sum, c) => sum + c.minutes, 0) !== sv.durationMinutes) {
      throw new Error(`Beispieldaten: Supervision „${sv.key}“: Dauer je Patient:in ergibt nicht die Gesamtdauer`);
    }
  }
}

/**
 * @param {{ key: string }[]} rows
 * @returns {Map<string, string>}
 */
function neueIds(rows) {
  return new Map(rows.map((row) => [row.key, randomUUID()]));
}

/**
 * @param {Map<string, string>} ids
 * @param {string} key
 * @returns {string}
 */
function idVon(ids, key) {
  const id = ids.get(key);
  if (!id) throw new Error(`Beispieldaten: Schlüssel „${key}“ ohne ID`);
  return id;
}

/**
 * @param {DemoDb} db Verbindung oder Transaktion (die Registrierung übergibt ihre Transaktion)
 * @param {string} userId
 * @param {DemoData} data
 * @returns {Promise<void>}
 */
export async function insertDemoData(db, userId, data) {
  checkDemoReferences(data);
  const patientIds = neueIds(data.patients);
  const supervisorIds = neueIds(data.supervisors);
  const sessionIds = neueIds(data.therapySessions);
  const supervisionIds = neueIds(data.supervisionSessions);
  const groupIds = neueIds(data.groups);
  const groupSessionIds = neueIds(data.groupSessions);

  await db.query(
    `INSERT INTO patients (id, user_id, chiffre, therapy_type, start_date, end_date, is_active, antragsdatum, beantragte_stunden,
                           genehmigungsdatum, sprechstunden_ambulanz)
     SELECT t.id, $1::uuid, t.chiffre, t.therapy_type, t.start_date, t.end_date, t.is_active, t.antragsdatum, t.beantragte_stunden,
            t.genehmigungsdatum, t.sprechstunden_ambulanz
     FROM unnest($2::uuid[], $3::varchar[], $4::varchar[], $5::date[], $6::date[], $7::boolean[], $8::date[], $9::int[],
                 $10::date[], $11::int[])
       AS t(id, chiffre, therapy_type, start_date, end_date, is_active, antragsdatum, beantragte_stunden,
            genehmigungsdatum, sprechstunden_ambulanz)`,
    [
      userId,
      data.patients.map((p) => idVon(patientIds, p.key)),
      data.patients.map((p) => p.chiffre),
      data.patients.map((p) => p.therapyType),
      data.patients.map((p) => p.startDate),
      data.patients.map((p) => p.endDate),
      data.patients.map((p) => p.isActive),
      data.patients.map((p) => p.antragsdatum),
      data.patients.map((p) => p.beantragteStunden),
      data.patients.map((p) => p.genehmigungsdatum),
      data.patients.map((p) => p.sprechstundenAmbulanz),
    ]
  );
  await db.query(
    `INSERT INTO supervisors (id, user_id, name, cost_per_hour, is_active)
     SELECT t.id, $1::uuid, t.name, t.cost_per_hour, t.is_active
     FROM unnest($2::uuid[], $3::varchar[], $4::numeric[], $5::boolean[]) AS t(id, name, cost_per_hour, is_active)`,
    [
      userId,
      data.supervisors.map((s) => idVon(supervisorIds, s.key)),
      data.supervisors.map((s) => s.name),
      data.supervisors.map((s) => s.costPerHour),
      data.supervisors.map((s) => s.isActive),
    ]
  );
  await db.query(
    `INSERT INTO groups (id, user_id, name, start_date, planned_session_count, avg_kids, is_active)
     SELECT t.id, $1::uuid, t.name, t.start_date, t.planned_session_count, t.avg_kids, t.is_active
     FROM unnest($2::uuid[], $3::varchar[], $4::date[], $5::int[], $6::numeric[], $7::boolean[])
       AS t(id, name, start_date, planned_session_count, avg_kids, is_active)`,
    [
      userId,
      data.groups.map((g) => idVon(groupIds, g.key)),
      data.groups.map((g) => g.name),
      data.groups.map((g) => g.startDate),
      data.groups.map((g) => g.plannedSessionCount),
      data.groups.map((g) => g.avgKids),
      data.groups.map((g) => g.isActive),
    ]
  );
  await db.query(
    `INSERT INTO therapy_sessions (id, user_id, patient_id, date, duration_minutes, notes, category)
     SELECT t.id, $1::uuid, t.patient_id, t.date, t.duration_minutes, t.notes, t.category
     FROM unnest($2::uuid[], $3::uuid[], $4::date[], $5::int[], $6::text[], $7::varchar[])
       AS t(id, patient_id, date, duration_minutes, notes, category)`,
    [
      userId,
      data.therapySessions.map((s) => idVon(sessionIds, s.key)),
      data.therapySessions.map((s) => idVon(patientIds, s.patient)),
      data.therapySessions.map((s) => s.date),
      data.therapySessions.map((s) => s.durationMinutes),
      data.therapySessions.map((s) => s.notes),
      data.therapySessions.map((s) => s.category),
    ]
  );
  await db.query(
    `INSERT INTO group_sessions (id, user_id, group_id, date, status, child_count, counts_toward_ambulanzzeit, duration_minutes, notes)
     SELECT t.id, $1::uuid, t.group_id, t.date, t.status, t.child_count, t.counts_toward_ambulanzzeit, t.duration_minutes, t.notes
     FROM unnest($2::uuid[], $3::uuid[], $4::date[], $5::varchar[], $6::int[], $7::boolean[], $8::int[], $9::text[])
       AS t(id, group_id, date, status, child_count, counts_toward_ambulanzzeit, duration_minutes, notes)`,
    [
      userId,
      data.groupSessions.map((g) => idVon(groupSessionIds, g.key)),
      data.groupSessions.map((g) => idVon(groupIds, g.group)),
      data.groupSessions.map((g) => g.date),
      data.groupSessions.map((g) => g.status),
      data.groupSessions.map((g) => g.childCount),
      data.groupSessions.map((g) => g.countsTowardAmbulanzzeit),
      data.groupSessions.map((g) => g.durationMinutes),
      data.groupSessions.map((g) => g.notes),
    ]
  );
  await db.query(
    `INSERT INTO supervision_sessions (id, user_id, supervisor_id, date, duration_minutes, kind, group_id)
     SELECT t.id, $1::uuid, t.supervisor_id, t.date, t.duration_minutes, t.kind, t.group_id
     FROM unnest($2::uuid[], $3::uuid[], $4::date[], $5::int[], $6::varchar[], $7::uuid[])
       AS t(id, supervisor_id, date, duration_minutes, kind, group_id)`,
    [
      userId,
      data.supervisionSessions.map((sv) => idVon(supervisionIds, sv.key)),
      data.supervisionSessions.map((sv) => idVon(supervisorIds, sv.supervisor)),
      data.supervisionSessions.map((sv) => sv.date),
      data.supervisionSessions.map((sv) => sv.durationMinutes),
      data.supervisionSessions.map((sv) => sv.kind),
      data.supervisionSessions.map((sv) => (sv.group ? idVon(groupIds, sv.group) : null)),
    ]
  );
  const therapieLinks = data.supervisionSessions.flatMap((sv) =>
    sv.therapySessions.map((key) => [idVon(supervisionIds, sv.key), idVon(sessionIds, key)])
  );
  await db.query(
    `INSERT INTO supervision_therapy_links (supervision_id, therapy_session_id)
     SELECT * FROM unnest($1::uuid[], $2::uuid[])`,
    [therapieLinks.map((l) => l[0]), therapieLinks.map((l) => l[1])]
  );
  const gruppenLinks = data.supervisionSessions.flatMap((sv) =>
    sv.groupSessions.map((key) => [idVon(supervisionIds, sv.key), idVon(groupSessionIds, key)])
  );
  await db.query(
    `INSERT INTO supervision_group_session_links (supervision_id, group_session_id)
     SELECT * FROM unnest($1::uuid[], $2::uuid[])`,
    [gruppenLinks.map((l) => l[0]), gruppenLinks.map((l) => l[1])]
  );
  const anteile = data.supervisionSessions.flatMap((sv) =>
    sv.cases.map((c) => /** @type {const} */ ([idVon(supervisionIds, sv.key), idVon(patientIds, c.patient), c.minutes]))
  );
  await db.query(
    `INSERT INTO supervision_cases (supervision_id, patient_id, minutes)
     SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::int[])`,
    [anteile.map((a) => a[0]), anteile.map((a) => a[1]), anteile.map((a) => a[2])]
  );
  if (data.financialSettings) {
    await db.query(
      "INSERT INTO financial_settings (user_id, income_per_hour, planned_sessions_per_week) VALUES ($1, $2, $3)",
      [userId, data.financialSettings.incomePerHour, data.financialSettings.plannedSessionsPerWeek]
    );
  }
}
