import { query, withTransaction, type Db } from "../db";
import { SupervisionSession, SupervisionSessionId, TherapySessionId, GroupSessionId } from "@/types";
import { CASE_SHARES_SQL, mapSupervisionSessionRow } from "../db-mappers";
import { NotFoundError, ValidationError } from "../errors";
import { getCurrentUserId } from "./get-current-user";

export async function getSupervisionSessions(): Promise<SupervisionSession[]> {
  const userId = await getCurrentUserId();

  // Single query with LEFT JOINs + array_agg to fix N+1
  const result = await query(
    `SELECT ss.id, ss.supervisor_id, ss.date, ss.duration_minutes, ss.kind, ss.setting, ss.group_id,
            COALESCE(array_agg(DISTINCT stl.therapy_session_id) FILTER (WHERE stl.therapy_session_id IS NOT NULL), '{}') AS linked_therapy_session_ids,
            COALESCE(array_agg(DISTINCT sgsl.group_session_id) FILTER (WHERE sgsl.group_session_id IS NOT NULL), '{}') AS linked_group_session_ids,
            ${CASE_SHARES_SQL} AS case_shares
     FROM supervision_sessions ss
     JOIN supervisors s ON ss.supervisor_id = s.id
     LEFT JOIN supervision_therapy_links stl ON stl.supervision_id = ss.id
     LEFT JOIN supervision_group_session_links sgsl ON sgsl.supervision_id = ss.id
     WHERE s.user_id = $1
     GROUP BY ss.id, ss.supervisor_id, ss.date, ss.duration_minutes, ss.kind, ss.setting, ss.group_id
     ORDER BY ss.date DESC`,
    [userId]
  );

  return result.rows.map((row) =>
    mapSupervisionSessionRow(
      row,
      row.linked_therapy_session_ids as TherapySessionId[],
      row.linked_group_session_ids as GroupSessionId[]
    )
  );
}

// Besitzprüfung für Supervisor:in und alle Verknüpfungen – gemeinsam für Anlegen und Ändern.
// Liest nur; fremde IDs führen zu NotFoundError, bevor irgendetwas geschrieben wird.
async function assertSupervisionOwnership(
  db: Db,
  userId: string,
  session: SupervisionSession,
  allowedGap = 0
): Promise<void> {
  const supervisorCheck = await db.query("SELECT id FROM supervisors WHERE id = $1 AND user_id = $2", [
    session.supervisorId,
    userId,
  ]);
  if (supervisorCheck.rows.length === 0) throw new NotFoundError("Supervisor:in");

  if (session.linkedTherapySessionIds.length > 0) {
    const owned = await db.query(
      "SELECT count(*)::int AS n FROM therapy_sessions WHERE id = ANY($1::uuid[]) AND user_id = $2",
      [session.linkedTherapySessionIds, userId]
    );
    if (owned.rows[0].n !== new Set(session.linkedTherapySessionIds).size) throw new NotFoundError("Therapiesitzung");
  }
  if (session.linkedGroupSessionIds.length > 0) {
    const owned = await db.query(
      "SELECT count(*)::int AS n FROM group_sessions WHERE id = ANY($1::uuid[]) AND user_id = $2",
      [session.linkedGroupSessionIds, userId]
    );
    if (owned.rows[0].n !== new Set(session.linkedGroupSessionIds).size) throw new NotFoundError("Gruppensitzung");
  }
  await assertCaseShares(db, userId, session, allowedGap);
  await assertLinksAvailable(db, session);
}

export const MELDUNG_SCHON_ZUGEORDNET =
  "Eine der gewählten Sitzungen ist inzwischen schon einer anderen Supervision zugeordnet. Bitte die Seite neu laden.";
const LINK_UNIQUE_CONSTRAINTS = new Set([
  "supervision_therapy_links_therapy_session_id_key",
  "supervision_group_session_links_group_session_id_key",
]);

// Eine Sitzung gehört zu höchstens einer Supervision (#35). Ein veralteter Tab bietet Sitzungen an, die inzwischen
// woanders zugeordnet sind – hier mit Sitzung und Datum ablehnen. Gleichzeitige Anfragen fängt der Unique-Index aus
// Migration 010 ab (insertSupervisionLinks). Neu verknüpfte Therapiesitzungen dürfen außerdem nicht nach dem Datum der
// Supervision liegen (#37); schon gespeicherte bleiben erlaubt, wie im Formular (linkableTherapySessions).
async function assertLinksAvailable(db: Db, session: SupervisionSession): Promise<void> {
  const taken: string[] = [];
  if (session.linkedTherapySessionIds.length > 0) {
    const { rows } = await db.query(
      `SELECT DISTINCT p.chiffre, ts.date, to_char(ts.date, 'DD.MM.YYYY') AS datum
       FROM supervision_therapy_links stl
       JOIN therapy_sessions ts ON ts.id = stl.therapy_session_id
       JOIN patients p ON p.id = ts.patient_id
       WHERE stl.therapy_session_id = ANY($1::uuid[]) AND stl.supervision_id <> $2
       ORDER BY ts.date, p.chiffre`,
      [session.linkedTherapySessionIds, session.id]
    );
    taken.push(...rows.map((r) => `${r.chiffre} am ${r.datum}`));
  }
  if (session.linkedGroupSessionIds.length > 0) {
    const { rows } = await db.query(
      `SELECT DISTINCT g.name, gs.date, to_char(gs.date, 'DD.MM.YYYY') AS datum
       FROM supervision_group_session_links sgl
       JOIN group_sessions gs ON gs.id = sgl.group_session_id
       JOIN groups g ON g.id = gs.group_id
       WHERE sgl.group_session_id = ANY($1::uuid[]) AND sgl.supervision_id <> $2
       ORDER BY gs.date, g.name`,
      [session.linkedGroupSessionIds, session.id]
    );
    taken.push(...rows.map((r) => `${r.name} am ${r.datum}`));
  }
  if (taken.length > 0) {
    const was = taken.length === 1 ? "Die Sitzung" : "Die Sitzungen";
    const ist = taken.length === 1 ? "ist" : "sind";
    throw new ValidationError(
      `${was} ${taken.join(", ")} ${ist} inzwischen schon einer anderen Supervision zugeordnet. Bitte die Seite neu laden.`
    );
  }

  if (session.linkedTherapySessionIds.length > 0) {
    const { rows } = await db.query(
      `SELECT p.chiffre, to_char(ts.date, 'DD.MM.YYYY') AS datum
       FROM therapy_sessions ts
       JOIN patients p ON p.id = ts.patient_id
       WHERE ts.id = ANY($1::uuid[]) AND ts.date > $2::date
         AND NOT EXISTS (SELECT 1 FROM supervision_therapy_links stl WHERE stl.therapy_session_id = ts.id AND stl.supervision_id = $3)
       ORDER BY ts.date, p.chiffre`,
      [session.linkedTherapySessionIds, session.date, session.id]
    );
    if (rows.length > 0) {
      const list = rows.map((r) => `${r.chiffre} am ${r.datum}`).join(", ");
      throw new ValidationError(
        rows.length === 1
          ? `Die Sitzung ${list} liegt nach dem Datum der Supervision`
          : `Die Sitzungen ${list} liegen nach dem Datum der Supervision`
      );
    }
  }
}

// Gruppenbezug (#47): nur bei Gruppensupervisionen, eigene Gruppe, verknüpfte Doppelstunden aus dieser Gruppe.
async function assertSupervisionGroup(db: Db, userId: string, session: SupervisionSession): Promise<void> {
  if (!session.groupId) return;
  if (session.kind !== "group") throw new ValidationError("Nur eine Gruppensupervision gehört zu einer Gruppe");
  const group = await db.query("SELECT id FROM groups WHERE id = $1 AND user_id = $2", [session.groupId, userId]);
  if (group.rows.length === 0) throw new NotFoundError("Gruppe");
  if (session.linkedGroupSessionIds.length > 0) {
    const inGroup = await db.query(
      "SELECT count(*)::int AS n FROM group_sessions WHERE id = ANY($1::uuid[]) AND group_id = $2 AND user_id = $3",
      [session.linkedGroupSessionIds, session.groupId, userId]
    );
    if (inGroup.rows[0].n !== new Set(session.linkedGroupSessionIds).size) {
      throw new ValidationError("Nur Doppelstunden dieser Gruppe verknüpfen");
    }
  }
}

// Anteile je Fall (#40): nur bei Einzeltherapie-Supervisionen, je Patient:in einmal, eigene Patient:innen. Gesamtdauer
// minus Summe der Anteile (Zeit ohne Fall) liegt zwischen 0 und allowedGap: beim Anlegen 0, beim Bearbeiten die schon
// gespeicherte Differenz (storedCaseGap). Jeder Fall einer verknüpften Sitzung braucht einen Anteil; ein Anteil ohne
// Sitzung ist erlaubt (deren Sitzungen wurden gelöscht, der Anteil bleibt). Die Zod-Schemas prüfen das Formale schon –
// hier für Aufrufer ohne Schema.
async function assertCaseShares(db: Db, userId: string, session: SupervisionSession, allowedGap: number): Promise<void> {
  const shares = session.caseShares;
  const patientIds = shares.map((c) => c.patientId);
  if (shares.length > 0) {
    if (session.kind !== "individual") throw new ValidationError("Eine Gruppensupervision hat keine Anteile je Patient:in");
    if (new Set(patientIds).size !== patientIds.length) throw new ValidationError("Jede Patient:in nur einmal angeben");
    const gap = session.durationMinutes - shares.reduce((sum, c) => sum + c.minutes, 0);
    if (gap < 0) throw new ValidationError("Die Summe der Dauern je Patient:in darf die Gesamtdauer nicht überschreiten");
    if (gap > allowedGap) {
      throw new ValidationError(
        allowedGap === 0
          ? "Die Gesamtdauer muss der Summe der Dauern je Patient:in entsprechen"
          : "Die Zeit ohne Fall darf beim Bearbeiten nicht wachsen"
      );
    }
    const owned = await db.query(
      "SELECT count(*)::int AS n FROM patients WHERE id = ANY($1::uuid[]) AND user_id = $2",
      [patientIds, userId]
    );
    if (owned.rows[0].n !== patientIds.length) throw new NotFoundError("Patient:in");
  }
  if (session.linkedTherapySessionIds.length > 0) {
    const missing = await db.query(
      "SELECT count(DISTINCT patient_id)::int AS n FROM therapy_sessions WHERE id = ANY($1::uuid[]) AND NOT (patient_id = ANY($2::uuid[]))",
      [session.linkedTherapySessionIds, patientIds]
    );
    if (missing.rows[0].n > 0) throw new ValidationError("Für jede besprochene Patient:in eine Dauer angeben");
  }
}

// Verknüpfungen und Anteile je Fall. Doppelte IDs (Aufrufer ohne Zod-Schema, z. B. ein späterer Import) würden am Primärschlüssel scheitern (23505);
// die Besitzprüfung zählt ohnehin über ein Set. Hier zusammenfassen, damit beide Wege dasselbe Ergebnis haben.
// Hat eine gleichzeitige Anfrage dieselbe Sitzung gerade zugeordnet, schlägt der Unique-Index an (23505) – dann die
// fachliche Meldung statt eines unerwarteten Fehlers.
async function insertSupervisionLinks(db: Db, session: SupervisionSession): Promise<void> {
  const therapyIds = [...new Set(session.linkedTherapySessionIds)];
  const groupIds = [...new Set(session.linkedGroupSessionIds)];
  try {
    if (therapyIds.length > 0) {
      await db.query(
        `INSERT INTO supervision_therapy_links (supervision_id, therapy_session_id)
         SELECT $1, unnest($2::uuid[])`,
        [session.id, therapyIds]
      );
    }
    if (groupIds.length > 0) {
      await db.query(
        `INSERT INTO supervision_group_session_links (supervision_id, group_session_id)
         SELECT $1, unnest($2::uuid[])`,
        [session.id, groupIds]
      );
    }
  } catch (error) {
    const { code, constraint } = error as { code?: string; constraint?: string };
    if (code === "23505" && constraint !== undefined && LINK_UNIQUE_CONSTRAINTS.has(constraint)) {
      throw new ValidationError(MELDUNG_SCHON_ZUGEORDNET);
    }
    throw error;
  }
  if (session.caseShares.length > 0) {
    await db.query(
      `INSERT INTO supervision_cases (supervision_id, patient_id, minutes)
       SELECT $1, unnest($2::uuid[]), unnest($3::int[])`,
      [session.id, session.caseShares.map((c) => c.patientId), session.caseShares.map((c) => c.minutes)]
    );
  }
}

export async function insertSupervisionSession(db: Db, userId: string, session: SupervisionSession): Promise<void> {
  await assertSupervisionOwnership(db, userId, session);
  await assertSupervisionGroup(db, userId, session);
  await db.query(
    `INSERT INTO supervision_sessions (id, user_id, supervisor_id, date, duration_minutes, kind, setting, group_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      session.id,
      userId,
      session.supervisorId,
      session.date,
      session.durationMinutes,
      session.kind,
      session.setting,
      session.groupId ?? null,
    ]
  );
  await insertSupervisionLinks(db, session);
}

export async function addSupervisionSession(session: SupervisionSession): Promise<void> {
  const userId = await getCurrentUserId();
  await withTransaction((tx) => insertSupervisionSession(tx, userId, session));
}

// Zeit ohne vorhandenen Fall: Gesamtdauer minus Summe der Anteile einer Supervision mit Anteilen. Entsteht, wenn eine
// Patient:in gelöscht wird (deletePatient). Beim Bearbeiten darf sie bleiben – sonst ginge erfasste Zeit verloren –,
// aber nicht wachsen; so lässt sich keine Zeit am Fall vorbei erfassen. Ohne Anteile 0.
async function storedCaseGap(db: Db, userId: string, id: string): Promise<number> {
  const { rows } = await db.query(
    `SELECT ss.duration_minutes - COALESCE(sum(sc.minutes), 0) AS gap, count(sc.patient_id)::int AS n
     FROM supervision_sessions ss LEFT JOIN supervision_cases sc ON sc.supervision_id = ss.id
     WHERE ss.id = $1 AND ss.user_id = $2
     GROUP BY ss.id`,
    [id, userId]
  );
  return rows.length > 0 && rows[0].n > 0 ? Math.max(0, Number(rows[0].gap)) : 0;
}

// Ersetzt Stammdaten, alle Verknüpfungen und die Anteile je Fall. Die Gruppe (#47) bleibt; wird aus der
// Gruppensupervision eine Einzelsupervision, entfällt sie. Nur innerhalb einer Transaktion aufrufen
// (Aufrufer: withTransaction), weil alte Verknüpfungen gelöscht und neue eingefügt werden.
// Alle Prüfungen laufen vor dem ersten Schreibzugriff, fremde IDs ändern also nichts.
export async function updateSupervisionSession(db: Db, userId: string, session: SupervisionSession): Promise<void> {
  // Fremde Supervision zuerst ablehnen – sonst meldete die Prüfung der Verknüpfungen Konflikte mit ihren Links.
  const own = await db.query("SELECT 1 FROM supervision_sessions WHERE id = $1 AND user_id = $2", [session.id, userId]);
  if (own.rows.length === 0) throw new NotFoundError("Supervisionssitzung");
  await assertSupervisionOwnership(db, userId, session, await storedCaseGap(db, userId, session.id));
  const result = await db.query(
    `UPDATE supervision_sessions
     SET supervisor_id = $1, date = $2, duration_minutes = $3, kind = $4, setting = $5,
         group_id = CASE WHEN $4::varchar = 'group' THEN group_id END, updated_at = now()
     WHERE id = $6 AND user_id = $7`,
    [session.supervisorId, session.date, session.durationMinutes, session.kind, session.setting, session.id, userId]
  );
  if (result.rowCount === 0) throw new NotFoundError("Supervisionssitzung");
  await db.query("DELETE FROM supervision_therapy_links WHERE supervision_id = $1", [session.id]);
  await db.query("DELETE FROM supervision_group_session_links WHERE supervision_id = $1", [session.id]);
  await db.query("DELETE FROM supervision_cases WHERE supervision_id = $1", [session.id]);
  await insertSupervisionLinks(db, session);
}

// Verknüpfungen und Anteile fallen per ON DELETE CASCADE weg; die verknüpften Sitzungen bleiben bestehen.
export async function deleteSupervisionSession(
  db: Db,
  userId: string,
  id: SupervisionSessionId | string
): Promise<void> {
  const result = await db.query("DELETE FROM supervision_sessions WHERE id = $1 AND user_id = $2", [id, userId]);
  if (result.rowCount === 0) throw new NotFoundError("Supervisionssitzung");
}
