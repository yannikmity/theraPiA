// @ts-check
// Fiktive Beispieldaten für Demo-Accounts (#9): fünf Patient:innen über gut ein Jahr, zwei Supervisor:innen, eine
// Gruppe mit Doppelstunden, Finanzeinstellungen. Alle Daten relativ zum Stichtag `today` (YYYY-MM-DD, Kalendertag in
// Europe/Berlin – die Registrierung übergibt todayIso(now)). Rein und deterministisch: kein Math.random, kein
// Date.now; gleicher Stichtag → gleiche Daten, anderer Stichtag → dieselben Daten verschoben. IDs vergibt erst der
// Schreibweg (demo-daten-db.mjs). Reines ESM ohne Abhängigkeiten, damit auch der Node-Seed es laden kann.
// Keine echten Namen: Chiffren, „Supervisor:in A/B“, „Gruppe Beispiel“.
//
// Kennzahlen (Stichtag 2026-09-28, geprüft in src/lib/__tests__/demo-daten.test.ts): 159 Sitzungen à 50 Min in sechs
// Quartalen, 32 Einzel- und 7 Gruppensupervisionen, Verhältnis gesamt 1 : 2,7, je Patient:in A–C im Soll, D knapp,
// E ohne Supervision; 15 unbesprochene Sitzungen; 32 Doppelstunden (25 durchgeführt, 23 davon Ambulanzzeit,
// 2 geplant in der Zukunft).

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @typedef {object} DemoPatient
 * @property {string} key
 * @property {string} chiffre
 * @property {"kurzzeittherapie" | "langzeittherapie"} therapyType
 * @property {string} startDate
 * @property {string | null} endDate
 * @property {boolean} isActive
 * @property {string | null} antragsdatum
 * @property {number | null} beantragteStunden
 * @property {string | null} genehmigungsdatum
 * @property {number} sprechstundenAmbulanz
 */
/**
 * @typedef {object} DemoSupervisor
 * @property {string} key
 * @property {string} name
 * @property {number | null} costPerHour
 * @property {boolean} isActive
 */
/**
 * @typedef {object} DemoTherapySession
 * @property {string} key
 * @property {string} patient Schlüssel der Patient:in
 * @property {string} date
 * @property {number} durationMinutes
 * @property {string} notes
 * @property {"probatorik" | "behandlung" | "bezugsperson"} category
 */
/**
 * @typedef {object} DemoSupervisionSession
 * @property {string} key
 * @property {string} supervisor Schlüssel der Supervisor:in
 * @property {string} date
 * @property {number} durationMinutes
 * @property {"individual" | "group"} kind
 * @property {string[]} therapySessions Schlüssel der besprochenen Sitzungen
 * @property {string[]} groupSessions Schlüssel der besprochenen Doppelstunden
 */
/**
 * @typedef {object} DemoGroup
 * @property {string} key
 * @property {string} name
 * @property {string} startDate
 * @property {number} plannedSessionCount
 * @property {number | null} avgKids
 * @property {boolean} isActive
 */
/**
 * @typedef {object} DemoGroupSession
 * @property {string} key
 * @property {string} group Schlüssel der Gruppe
 * @property {string} date
 * @property {"durchgefuehrt" | "ausgefallen" | "urlaub" | "geplant"} status
 * @property {number | null} childCount
 * @property {boolean} countsTowardAmbulanzzeit
 * @property {number} durationMinutes
 * @property {string} notes
 */
/**
 * @typedef {object} DemoData
 * @property {DemoPatient[]} patients
 * @property {DemoSupervisor[]} supervisors
 * @property {DemoTherapySession[]} therapySessions
 * @property {DemoSupervisionSession[]} supervisionSessions
 * @property {DemoGroup[]} groups
 * @property {DemoGroupSession[]} groupSessions
 * @property {{ incomePerHour: number; plannedSessionsPerWeek: number | null } | null} financialSettings
 */

/**
 * Kalendertag plus n Tage, reine UTC-Arithmetik auf YYYY-MM-DD (keine Zeitzone, keine Sommerzeit). Wie addDaysIso in
 * src/lib/dates.ts, hier ohne TypeScript und ohne date-fns, weil auch der Node-Seed dieses Modul lädt.
 * @param {string} iso
 * @param {number} days
 * @returns {string}
 */
export function addDaysIso(iso, days) {
  if (!ISO_DATE.test(iso)) throw new Error(`Kein Datum im Format JJJJ-MM-TT: ${iso}`);
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Therapieverlauf je Patient:in in Wochen vor dem Stichtag (0 = diese Woche).
 * @typedef {object} PatientPlan
 * @property {string} key
 * @property {string} chiffre
 * @property {DemoPatient["therapyType"]} therapyType
 * @property {number} vonWoche erste Sitzungswoche
 * @property {number} bisWoche letzte Sitzungswoche; ab Woche 2 gilt die Therapie als abgeschlossen
 * @property {number} offset Tage zusätzlich zur Woche (verteilt die Patient:innen auf Wochentage)
 * @property {number} pause jede pause-te Woche fällt aus (Urlaub, Absage); 0 = keine
 * @property {number} probatorik so viele erste Sitzungen sind Probatorik
 * @property {{ wochen: number; stunden: number } | null} antrag Antrag so viele Wochen nach Beginn
 * @property {number[]} bezugsperson Indizes der Sitzungen mit Bezugsperson
 */

/** @type {PatientPlan[]} */
const PATIENTEN = [
  { key: "A", chiffre: "A-1041", therapyType: "langzeittherapie", vonWoche: 70, bisWoche: 0, offset: 1, pause: 10, probatorik: 4, antrag: { wochen: 5, stunden: 60 }, bezugsperson: [20, 40] },
  { key: "B", chiffre: "B-2317", therapyType: "langzeittherapie", vonWoche: 58, bisWoche: 1, offset: 2, pause: 9, probatorik: 4, antrag: { wochen: 5, stunden: 80 }, bezugsperson: [18] },
  { key: "C", chiffre: "C-3082", therapyType: "kurzzeittherapie", vonWoche: 40, bisWoche: 13, offset: 3, pause: 7, probatorik: 2, antrag: { wochen: 3, stunden: 24 }, bezugsperson: [] },
  { key: "D", chiffre: "D-4265", therapyType: "langzeittherapie", vonWoche: 17, bisWoche: 1, offset: 4, pause: 10, probatorik: 4, antrag: { wochen: 5, stunden: 60 }, bezugsperson: [] },
  { key: "E", chiffre: "E-5119", therapyType: "langzeittherapie", vonWoche: 2, bisWoche: 0, offset: 5, pause: 0, probatorik: 2, antrag: null, bezugsperson: [] },
];

/** @type {DemoSupervisor[]} */
const SUPERVISORINNEN = [
  { key: "s1", name: "Supervisor:in A", costPerHour: 90, isActive: true },
  { key: "s2", name: "Supervisor:in B", costPerHour: 80, isActive: true },
];

const GRUPPE = { key: "g1", name: "Gruppe Beispiel", vonWoche: 30, offset: 6, plannedSessionCount: 40, avgKids: 7 };
// Einzelsupervision alle zwei Wochen bei Supervisor:in A: bespricht die Sitzungen dieser und der Vorwoche, nie E
// (neu, noch ohne Supervision) und zweimal nicht D (D wird dadurch „knapp“). Drei oder mehr Personen: 100 Min.
const EINZEL_SV = { vonWoche: 64, bisWoche: 2, schritt: 2, ohneD: [8, 16] };
// Gruppensupervision bei Supervisor:in B: bespricht die durchgeführten Doppelstunden eines Vier-Wochen-Fensters.
const GRUPPEN_SV = { wochen: [2, 6, 10, 14, 18, 22, 26], fenster: 4 };

/**
 * @param {number} woche
 * @param {number} pause
 */
const ausgelassen = (woche, pause) => pause > 0 && woche > 0 && woche % pause === 0;

/**
 * @param {string} today Stichtag als YYYY-MM-DD
 * @returns {DemoData}
 */
export function generateDemoData(today) {
  if (addDaysIso(today, 0) !== today) throw new Error(`Kein gültiges Datum: ${today}`);
  /** @param {number} n */
  const vorTagen = (n) => addDaysIso(today, -n);
  /** @type {Map<string, number>} Woche je Sitzungs- bzw. Doppelstunden-Schlüssel */
  const woche = new Map();

  /** @type {DemoPatient[]} */
  const patients = [];
  /** @type {DemoTherapySession[]} */
  const therapySessions = [];
  for (const p of PATIENTEN) {
    /** @type {number[]} */
    const wochen = [];
    for (let k = p.vonWoche; k >= p.bisWoche; k--) if (!ausgelassen(k, p.pause)) wochen.push(k);
    wochen.forEach((k, i) => {
      /** @type {DemoTherapySession["category"]} */
      const category = i < p.probatorik ? "probatorik" : p.bezugsperson.includes(i) ? "bezugsperson" : "behandlung";
      const key = `${p.key}-${k}`;
      woche.set(key, k);
      therapySessions.push({
        key,
        patient: p.key,
        date: vorTagen(7 * k + p.offset),
        durationMinutes: 50,
        notes: i === 0 ? "Erstgespräch" : category === "bezugsperson" ? "Bezugspersonengespräch" : "",
        category,
      });
    });
    const startDate = vorTagen(7 * p.vonWoche + p.offset);
    const abgeschlossen = p.bisWoche > 1;
    patients.push({
      key: p.key,
      chiffre: p.chiffre,
      therapyType: p.therapyType,
      startDate,
      endDate: abgeschlossen ? vorTagen(7 * p.bisWoche + p.offset) : null,
      isActive: !abgeschlossen,
      antragsdatum: p.antrag ? addDaysIso(startDate, 7 * p.antrag.wochen) : null,
      beantragteStunden: p.antrag ? p.antrag.stunden : null,
      genehmigungsdatum: null,
      sprechstundenAmbulanz: 0,
    });
  }

  /** @type {DemoGroupSession[]} */
  const groupSessions = [];
  for (let k = GRUPPE.vonWoche; k >= 1; k--) {
    /** @type {DemoGroupSession["status"]} */
    const status = k % 9 === 0 ? "ausgefallen" : k % 13 === 0 ? "urlaub" : "durchgefuehrt";
    const key = `gs-${k}`;
    woche.set(key, k);
    groupSessions.push({
      key,
      group: GRUPPE.key,
      date: vorTagen(7 * k + GRUPPE.offset),
      status,
      childCount: status === "durchgefuehrt" ? 5 + (k % 4) : null,
      countsTowardAmbulanzzeit: k % 11 !== 0,
      durationMinutes: 100,
      notes: "",
    });
  }
  for (const [i, tage] of [1, 8].entries()) {
    groupSessions.push({
      key: `gs-plan-${i + 1}`,
      group: GRUPPE.key,
      date: vorTagen(-tage),
      status: "geplant",
      childCount: null,
      countsTowardAmbulanzzeit: true,
      durationMinutes: 100,
      notes: "",
    });
  }

  /** @type {DemoSupervisionSession[]} */
  const supervisionSessions = [];
  for (let k = EINZEL_SV.vonWoche; k >= EINZEL_SV.bisWoche; k -= EINZEL_SV.schritt) {
    const besprochen = therapySessions.filter((s) => {
      const w = woche.get(s.key);
      if (w !== k && w !== k + 1) return false;
      if (s.patient === "E") return false;
      return !(s.patient === "D" && EINZEL_SV.ohneD.includes(k));
    });
    const personen = new Set(besprochen.map((s) => s.patient)).size;
    supervisionSessions.push({
      key: `sv-${k}`,
      supervisor: "s1",
      date: vorTagen(7 * k),
      durationMinutes: personen >= 3 ? 100 : 50,
      kind: "individual",
      therapySessions: besprochen.map((s) => s.key),
      groupSessions: [],
    });
  }
  for (const k of GRUPPEN_SV.wochen) {
    const besprochen = groupSessions.filter((g) => {
      const w = woche.get(g.key);
      return g.status === "durchgefuehrt" && w !== undefined && w >= k && w < k + GRUPPEN_SV.fenster;
    });
    supervisionSessions.push({
      key: `gsv-${k}`,
      supervisor: "s2",
      date: vorTagen(7 * k + GRUPPE.offset),
      durationMinutes: 60,
      kind: "group",
      therapySessions: [],
      groupSessions: besprochen.map((g) => g.key),
    });
  }

  return {
    patients,
    supervisors: SUPERVISORINNEN.map((s) => ({ ...s })),
    therapySessions,
    supervisionSessions,
    groups: [
      {
        key: GRUPPE.key,
        name: GRUPPE.name,
        startDate: vorTagen(7 * GRUPPE.vonWoche + GRUPPE.offset),
        plannedSessionCount: GRUPPE.plannedSessionCount,
        avgKids: GRUPPE.avgKids,
        isActive: true,
      },
    ],
    groupSessions,
    financialSettings: { incomePerHour: 70, plannedSessionsPerWeek: null },
  };
}
