// Schreibt deterministische, fiktive Daten in die Wegwerf-Datenbank der Screenshot-Regression.
// Aufruf: npm run shots:seed (lädt .env.screenshots). Leert vorher ALLE Tabellen – deshalb der Namensschutz.
// Fachdaten laufen über denselben Schreibweg wie die Beispieldaten der Demo-Accounts (src/lib/demo, #9).
import pg from "pg";
import bcrypt from "bcryptjs";
import { SCREENSHOT_USER, assertThrowawayDatabase, daysAgoIso } from "./screenshots-lib.mjs";
import { insertDemoData } from "../src/lib/demo/demo-daten-db.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL fehlt – npm run shots:seed lädt sie aus .env.screenshots");
  process.exit(1);
}
const dbName = assertThrowawayDatabase(databaseUrl);

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

const one = async (sql, params = []) => (await client.query(sql, params)).rows[0];
// Daten relativ zu „heute“ (Schnellerfassung „Wie letzte Woche“, Quartalsprognose) auf Berliner Kalendertagen
// (daysAgoIso) – Seed und Aufnahme deshalb am selben Tag (CONTRIBUTING.md).

// Feste Bilddaten: Selektoren (A-1, Supervision Nord, Gruppe Beispiel), der Nachweis-Zeitraum 2026-01-01 bis
// 2026-03-31 in PAGES und genau drei Vorschläge „Wie letzte Woche“ hängen daran – nicht durch die generierten
// Beispieldaten ersetzen. Form: DemoData aus src/lib/demo/demo-daten.mjs (Verweise über Schlüssel).
function bilddaten() {
  const sitzung = (key, patient, date, category, notes = "") => ({ key, patient, date, durationMinutes: 50, notes, category });
  const supervision = (key, supervisor, date, kind, therapySessions, groupSessions = []) => ({
    key,
    supervisor,
    date,
    durationMinutes: 60,
    kind,
    therapySessions,
    groupSessions,
  });
  const doppelstunde = (key, date, status, childCount) => ({
    key,
    group: "gruppe",
    date,
    status,
    childCount,
    countsTowardAmbulanzzeit: true,
    durationMinutes: 100,
    notes: "",
  });
  const a2Daten = ["2025-10-06", "2025-10-20", "2025-11-03", "2025-11-17", "2026-01-05", "2026-02-23"];
  // Aktuelle Sitzungen für A-3 (wöchentlich, zuletzt dichter) und eine für A-1 vor 10 Tagen:
  // - Rückblick 8 Wochen für den Schnitt der Quartalsprognose, Sitzungen im laufenden Quartal
  // - „Wie letzte Woche“ (Quellen vor 7–13 Tagen): A-3 vor 12, 9 und 7 Tagen, A-1 vor 10 Tagen;
  //   die Sitzung vor 2 Tagen macht den Vorschlag aus „vor 9 Tagen“ zur Doppelten → drei Vorschläge
  const a3Tage = [63, 56, 49, 42, 35, 28, 21, 14, 12, 9, 7, 2];
  return {
    supervisors: [
      { key: "nord", name: "Supervision Nord", costPerHour: 90, isActive: true },
      { key: "sued", name: "Supervision Süd", costPerHour: 80, isActive: true },
      { key: "west", name: "Supervision West", costPerHour: null, isActive: false },
    ],
    patients: [
      { key: "a1", chiffre: "A-1", therapyType: "langzeittherapie", startDate: "2026-01-12", endDate: null, isActive: true, antragsdatum: "2026-02-01", beantragteStunden: 60, genehmigungsdatum: null, sprechstundenAmbulanz: 0 },
      { key: "a2", chiffre: "A-2", therapyType: "kurzzeittherapie", startDate: "2025-10-06", endDate: "2026-03-30", isActive: false, antragsdatum: null, beantragteStunden: null, genehmigungsdatum: null, sprechstundenAmbulanz: 0 },
      { key: "a3", chiffre: "A-3", therapyType: "langzeittherapie", startDate: "2026-04-13", endDate: null, isActive: true, antragsdatum: null, beantragteStunden: null, genehmigungsdatum: null, sprechstundenAmbulanz: 0 },
    ],
    therapySessions: [
      sitzung("a1-1", "a1", "2026-01-12", "probatorik", "Erstgespräch"),
      sitzung("a1-2", "a1", "2026-01-19", "probatorik"),
      sitzung("a1-3", "a1", "2026-02-02", "behandlung"),
      sitzung("a1-4", "a1", "2026-02-09", "behandlung"),
      sitzung("a1-5", "a1", "2026-02-16", "bezugsperson", "Bezugspersonengespräch"),
      ...a2Daten.map((date, i) => sitzung(`a2-${i + 1}`, "a2", date, "behandlung")),
      ...a3Tage.map((n, i) => sitzung(`a3-${i + 1}`, "a3", daysAgoIso(n), "behandlung")),
      sitzung("a1-6", "a1", daysAgoIso(10), "behandlung"),
    ],
    supervisionSessions: [
      supervision("sv-1", "nord", "2026-02-10", "individual", ["a1-1", "a1-2"]),
      supervision("sv-2", "nord", "2026-03-05", "individual", ["a2-1", "a2-2"]),
      // Supervision im laufenden Quartal (Kosten in „bisher“ der Prognose), bespricht die A-3-Sitzungen vor 21 und 14 Tagen.
      supervision("sv-3", "nord", daysAgoIso(20), "individual", ["a3-7", "a3-8"]),
      supervision("gsv-1", "sued", "2026-03-12", "group", [], ["gs-1", "gs-2"]),
    ],
    groups: [{ key: "gruppe", name: "Gruppe Beispiel", startDate: "2026-03-02", plannedSessionCount: 20, avgKids: 8, isActive: true }],
    groupSessions: [
      doppelstunde("gs-1", "2026-03-02", "durchgefuehrt", 8),
      doppelstunde("gs-2", "2026-03-09", "durchgefuehrt", 7),
      doppelstunde("gs-3", "2026-03-16", "ausgefallen", null),
      doppelstunde("gs-4", "2026-03-23", "geplant", null),
    ],
    financialSettings: { incomePerHour: 85, plannedSessionsPerWeek: null },
  };
}

try {
  await client.query("BEGIN");
  await client.query(
    `TRUNCATE users, invitations, password_reset_tokens, patients, supervisors, therapy_sessions,
     supervision_sessions, supervision_therapy_links, supervision_group_session_links,
     financial_settings, groups, group_sessions, ausbildungsregeln_abweichungen, ausbildungsprofil,
     ebm_staffel_stufen, ebm_staffeln RESTART IDENTITY CASCADE`
  );

  // Ausbildungsregeln (#8): Profil mit den Standardwerten und zwei Staffeln mit gleichen Beträgen (die zweite ab
  // 2026-01-01) – die Pflegeseite zeigt eine Liste, und keine Zahl auf den übrigen Seiten ändert sich.
  await client.query(
    `INSERT INTO ausbildungsprofil (behandlungsstunden_ziel, sv_einheiten_ziel, verhaeltnis_warnung, verhaeltnis_kritisch,
       gruppe_doppelstunden_ziel, gruppe_ambulanzzeit_ziel) VALUES (600, 150, 4, 5, 60, 40)`
  );
  for (const gueltigAb of ["2000-01-01", "2026-01-01"]) {
    const staffel = await one("INSERT INTO ebm_staffeln (gueltig_ab) VALUES ($1) RETURNING id", [gueltigAb]);
    await client.query(
      `INSERT INTO ebm_staffel_stufen (staffel_id, kinderzahl, honorar_gesamt, honorar_anteil)
       SELECT $1::uuid, v.k, v.g, v.a FROM (VALUES (3, 177, 88.5), (4, 200, 100), (5, 225, 112.5), (6, 243, 121.5),
         (7, 266, 133), (8, 288, 144), (9, 301.5, 150.75)) AS v(k, g, a)`,
      [staffel.id]
    );
  }

  // Kostenfaktor 4 reicht für Wegwerfdaten; bcrypt.compare beim Login akzeptiert jeden Faktor.
  const passwordHash = await bcrypt.hash(SCREENSHOT_USER.password, 4);
  const user = await one(
    "INSERT INTO users (email, password_hash, name, role, created_at) VALUES ($1, $2, $3, 'admin', '2025-10-01') RETURNING id",
    [SCREENSHOT_USER.email, passwordHash, SCREENSHOT_USER.name]
  );
  await client.query(
    "INSERT INTO users (email, password_hash, name, role, disabled_at, created_at) VALUES ('gesperrt@example.com', $1, 'PiA Gesperrt', 'pia', '2026-03-01', '2026-01-15')",
    [passwordHash]
  );
  await client.query(
    "INSERT INTO invitations (token_hash, email, role, created_by, expires_at, created_at) VALUES (repeat('a', 64), 'neu@example.com', 'pia', $1, '2099-01-01', '2026-03-10')",
    [user.id]
  );

  await insertDemoData(client, user.id, bilddaten());

  await client.query("COMMIT");
  console.log(`Seed fertig in ${dbName}: Login ${SCREENSHOT_USER.email} / ${SCREENSHOT_USER.password}`);
} catch (error) {
  await client.query("ROLLBACK");
  console.error("Seed fehlgeschlagen:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
