import type { Db } from "../db";
import {
  DEFAULT_AUSBILDUNGSREGELN,
  REGEL_FELDER,
  type Ausbildungsregeln,
  type EbmStaffel,
  type EbmStufe,
  type RegelAbweichungen,
  type RegelFeld,
  type Regelwerk,
} from "../ausbildungsregeln/model";
import { resolveRegelwerk } from "../ausbildungsregeln/resolve";
import { NotFoundError, ValidationError } from "../errors";

// Laden und Speichern der Ausbildungsregeln (#8). Ohne Rechteprüfung – die erledigt der Aufrufer (Seite bzw.
// createAction mit role "admin"; persönliche Abweichungen immer mit der User-ID aus der Sitzung).

export const MELDUNG_DATUM_VERGEBEN = "Für dieses Datum gibt es schon eine Staffel";
export const MELDUNG_LETZTE_STAFFEL = "Die letzte Staffel kann nicht gelöscht werden – mindestens eine muss gelten";

const SPALTE: Record<RegelFeld, string> = {
  behandlungsstundenZiel: "behandlungsstunden_ziel",
  svEinheitenZiel: "sv_einheiten_ziel",
  verhaeltnisWarnung: "verhaeltnis_warnung",
  verhaeltnisKritisch: "verhaeltnis_kritisch",
  gruppeDoppelstundenZiel: "gruppe_doppelstunden_ziel",
  gruppeAmbulanzzeitZiel: "gruppe_ambulanzzeit_ziel",
};
const SPALTEN = REGEL_FELDER.map((feld) => SPALTE[feld]).join(", ");
const PLATZHALTER = (ab: number) => REGEL_FELDER.map((_, i) => `$${i + ab}`).join(", ");
const UEBERNEHMEN = REGEL_FELDER.map((feld) => `${SPALTE[feld]} = EXCLUDED.${SPALTE[feld]}`).join(", ");

type Zeile = Record<string, number | null>;

function alsRegeln(row: Zeile): Ausbildungsregeln {
  const regeln = {} as Ausbildungsregeln;
  for (const feld of REGEL_FELDER) regeln[feld] = Number(row[SPALTE[feld]]);
  return regeln;
}

function alsAbweichungen(row: Zeile): RegelAbweichungen {
  const abweichungen = {} as RegelAbweichungen;
  for (const feld of REGEL_FELDER) {
    const wert = row[SPALTE[feld]];
    abweichungen[feld] = wert === null ? null : Number(wert);
  }
  return abweichungen;
}

export async function loadInstanzprofil(db: Db): Promise<Ausbildungsregeln | null> {
  const { rows } = await db.query(`SELECT ${SPALTEN} FROM ausbildungsprofil`);
  return rows[0] ? alsRegeln(rows[0]) : null;
}

export async function loadAbweichungen(db: Db, userId: string): Promise<RegelAbweichungen | null> {
  const { rows } = await db.query(`SELECT ${SPALTEN} FROM ausbildungsregeln_abweichungen WHERE user_id = $1`, [userId]);
  return rows[0] ? alsAbweichungen(rows[0]) : null;
}

// to_char und Number(): unabhängig davon, ob der Typ-Parser aus pg-types geladen ist (sonst Date bzw. NUMERIC als Text).
export async function loadEbmStaffeln(db: Db): Promise<EbmStaffel[]> {
  const { rows } = await db.query(
    `SELECT s.id, to_char(s.gueltig_ab, 'YYYY-MM-DD') AS gueltig_ab, st.kinderzahl, st.honorar_gesamt, st.honorar_anteil
     FROM ebm_staffeln s LEFT JOIN ebm_staffel_stufen st ON st.staffel_id = s.id
     ORDER BY s.gueltig_ab, st.kinderzahl`
  );
  const staffeln = new Map<string, EbmStaffel>();
  for (const row of rows) {
    let staffel = staffeln.get(row.id);
    if (!staffel) {
      staffel = { id: row.id, gueltigAb: row.gueltig_ab, stufen: [] };
      staffeln.set(row.id, staffel);
    }
    if (row.kinderzahl !== null) {
      staffel.stufen.push({ kinderzahl: row.kinderzahl, total: Number(row.honorar_gesamt), share: Number(row.honorar_anteil) });
    }
  }
  return [...staffeln.values()];
}

// Nacheinander statt Promise.all: mit dem Test-Client und im Snapshot (withSnapshot) teilen sich alle Abfragen eine Verbindung (wie loadUserData).
export async function loadRegelwerk(db: Db, userId: string): Promise<Regelwerk> {
  const instanz = await loadInstanzprofil(db);
  const abweichungen = await loadAbweichungen(db, userId);
  const ebmStaffeln = await loadEbmStaffeln(db);
  return resolveRegelwerk({ instanz, abweichungen, ebmStaffeln });
}

export interface AusbildungsprofilDaten {
  regeln: Ausbildungsregeln; // gespeichertes Profil oder, ohne Zeile, die Standardwerte
  quelle: "standard" | "instanz";
  standard: Ausbildungsregeln; // zum Vergleich im Formular
}

export async function loadAusbildungsprofilDaten(db: Db): Promise<AusbildungsprofilDaten> {
  const instanz = await loadInstanzprofil(db);
  return {
    regeln: instanz ?? { ...DEFAULT_AUSBILDUNGSREGELN },
    quelle: instanz ? "instanz" : "standard",
    standard: { ...DEFAULT_AUSBILDUNGSREGELN },
  };
}

// Für die Pflegeseite: gespeicherte Staffeln oder – ohne Zeilen – die Standard-Staffel (id null, noch nicht gespeichert).
export async function loadEbmStaffelnFuerPflege(db: Db): Promise<EbmStaffel[]> {
  return resolveRegelwerk({ instanz: null, abweichungen: null, ebmStaffeln: await loadEbmStaffeln(db) }).ebmStaffeln;
}

export async function saveInstanzprofil(db: Db, regeln: Ausbildungsregeln): Promise<void> {
  await db.query(
    `INSERT INTO ausbildungsprofil (id, ${SPALTEN}) VALUES (true, ${PLATZHALTER(1)})
     ON CONFLICT (id) DO UPDATE SET ${UEBERNEHMEN}, updated_at = now()`,
    REGEL_FELDER.map((feld) => regeln[feld])
  );
}

// Zurück auf die Standardwerte aus dem Code: die Zeile verschwindet, der Resolver fällt auf die Standardwerte zurück.
export async function resetInstanzprofil(db: Db): Promise<void> {
  await db.query("DELETE FROM ausbildungsprofil");
}

export async function saveAbweichungen(db: Db, userId: string, abweichungen: RegelAbweichungen): Promise<void> {
  if (REGEL_FELDER.every((feld) => abweichungen[feld] === null)) {
    await resetAbweichungen(db, userId);
    return;
  }
  await db.query(
    `INSERT INTO ausbildungsregeln_abweichungen (user_id, ${SPALTEN}) VALUES ($1, ${PLATZHALTER(2)})
     ON CONFLICT (user_id) DO UPDATE SET ${UEBERNEHMEN}, updated_at = now()`,
    [userId, ...REGEL_FELDER.map((feld) => abweichungen[feld])]
  );
}

export async function resetAbweichungen(db: Db, userId: string): Promise<void> {
  await db.query("DELETE FROM ausbildungsregeln_abweichungen WHERE user_id = $1", [userId]);
}

// In einer Transaktion aufrufen (withTransaction): Kopf und Stufen gehören zusammen. Beim Bearbeiten werden die Stufen
// ersetzt. Ein schon vergebener Gültigkeitsbeginn (UNIQUE, 23505) wird zur Meldung am Feld; andere Fehler gehen weiter.
export async function saveEbmStaffel(
  tx: Db,
  staffel: { id: string | null; gueltigAb: string; stufen: EbmStufe[] }
): Promise<string> {
  try {
    let id = staffel.id;
    if (id === null) {
      id = (await tx.query("INSERT INTO ebm_staffeln (gueltig_ab) VALUES ($1) RETURNING id", [staffel.gueltigAb])).rows[0].id as string;
    } else {
      const updated = await tx.query("UPDATE ebm_staffeln SET gueltig_ab = $2, updated_at = now() WHERE id = $1", [id, staffel.gueltigAb]);
      if (updated.rowCount === 0) throw new NotFoundError("EBM-Staffel");
      await tx.query("DELETE FROM ebm_staffel_stufen WHERE staffel_id = $1", [id]);
    }
    for (const stufe of staffel.stufen) {
      await tx.query(
        "INSERT INTO ebm_staffel_stufen (staffel_id, kinderzahl, honorar_gesamt, honorar_anteil) VALUES ($1, $2, $3, $4)",
        [id, stufe.kinderzahl, stufe.total, stufe.share]
      );
    }
    return id;
  } catch (error) {
    const { code, constraint } = error as { code?: string; constraint?: string };
    if (code === "23505" && constraint === "ebm_staffeln_gueltig_ab_key") {
      throw new ValidationError(MELDUNG_DATUM_VERGEBEN, { gueltigAb: [MELDUNG_DATUM_VERGEBEN] });
    }
    throw error;
  }
}

// In einer Transaktion aufrufen. FOR UPDATE sperrt alle Staffeln: zwei gleichzeitige Löschungen der letzten beiden
// können so nicht beide „es gibt noch eine andere“ sehen.
export async function deleteEbmStaffel(tx: Db, id: string): Promise<void> {
  const { rows } = await tx.query("SELECT id FROM ebm_staffeln ORDER BY gueltig_ab FOR UPDATE");
  if (rows.length <= 1) throw new ValidationError(MELDUNG_LETZTE_STAFFEL);
  const deleted = await tx.query("DELETE FROM ebm_staffeln WHERE id = $1", [id]);
  if (deleted.rowCount === 0) throw new NotFoundError("EBM-Staffel");
}
