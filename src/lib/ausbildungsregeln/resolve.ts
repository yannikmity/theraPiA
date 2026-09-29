import {
  DEFAULT_AUSBILDUNGSREGELN,
  DEFAULT_EBM_STAFFELN,
  KEINE_ABWEICHUNGEN,
  REGEL_FELDER,
  REGEL_PAARE,
  type Ausbildungsregeln,
  type EbmStaffel,
  type RegelAbweichungen,
  type Regelwerk,
} from "./model";

export interface RegelwerkQuellen {
  instanz: Ausbildungsregeln | null; // Zeile aus ausbildungsprofil, null = keine
  abweichungen: RegelAbweichungen | null; // Zeile aus ausbildungsregeln_abweichungen, null = keine
  ebmStaffeln: EbmStaffel[]; // aus der Datenbank, [] = keine
}

const kopie = (s: EbmStaffel): EbmStaffel => ({
  ...s,
  stufen: s.stufen.map((st) => ({ ...st })).sort((a, b) => a.kinderzahl - b.kinderzahl),
});

// Rein: Standard → Instanz → persönliche Abweichung. Liefert nur Kopien, damit kein Aufrufer die Standardwerte
// verändern kann. Halbe Paare (nur Soll, ohne kritisch) gelten nicht – die Datenbank lässt sie nicht zu, der Resolver
// schützt trotzdem.
export function resolveRegelwerk(q: RegelwerkQuellen): Regelwerk {
  const basis: Ausbildungsregeln = { ...(q.instanz ?? DEFAULT_AUSBILDUNGSREGELN) };
  const abweichungen: RegelAbweichungen = { ...(q.abweichungen ?? KEINE_ABWEICHUNGEN) };
  for (const [a, b] of REGEL_PAARE) {
    if ((abweichungen[a] === null) !== (abweichungen[b] === null)) {
      abweichungen[a] = null;
      abweichungen[b] = null;
    }
  }
  const regeln: Ausbildungsregeln = { ...basis };
  for (const feld of REGEL_FELDER) {
    const wert = abweichungen[feld];
    if (wert !== null) regeln[feld] = wert;
  }
  const staffeln = q.ebmStaffeln.length > 0 ? q.ebmStaffeln : DEFAULT_EBM_STAFFELN;
  return {
    regeln,
    basis,
    basisQuelle: q.instanz ? "instanz" : "standard",
    abweichungen,
    abweichend: REGEL_FELDER.filter((feld) => abweichungen[feld] !== null),
    ebmStaffeln: staffeln.map(kopie).sort((a, b) => a.gueltigAb.localeCompare(b.gueltigAb)),
  };
}

// Regelwerk ohne jede Datenbankzeile – für Tests und als Rückfall. In der App kommt das Regelwerk immer über
// loadRegelwerk/getCurrentRegelwerk (regel-guard.test.ts).
export function standardRegelwerk(): Regelwerk {
  return resolveRegelwerk({ instanz: null, abweichungen: null, ebmStaffeln: [] });
}

// Maßgeblich ist das Datum der Doppelstunde: die Staffel mit dem spätesten Beginn bis zu diesem Tag. Vor der ältesten
// Staffel gilt die älteste – alte Daten verlieren so nie ihr Honorar.
export function ebmStaffelFuer(datum: string, staffeln: EbmStaffel[]): EbmStaffel {
  const sortiert = [...(staffeln.length > 0 ? staffeln : DEFAULT_EBM_STAFFELN)].sort((a, b) => a.gueltigAb.localeCompare(b.gueltigAb));
  let gewaehlt = sortiert[0];
  for (const staffel of sortiert) {
    if (staffel.gueltigAb <= datum) gewaehlt = staffel;
  }
  return gewaehlt;
}

// Unter der kleinsten Kinderzahl kein Honorar, über der größten deren Stufe (bisher fest: 3 und 9).
export function ebmStufeFuer(kinderzahl: number, staffel: EbmStaffel): { total: number; share: number } | null {
  const stufen = [...staffel.stufen].sort((a, b) => a.kinderzahl - b.kinderzahl);
  if (stufen.length === 0 || kinderzahl < stufen[0].kinderzahl) return null;
  const k = Math.min(kinderzahl, stufen[stufen.length - 1].kinderzahl);
  const stufe = stufen.find((s) => s.kinderzahl === k);
  return stufe ? { total: stufe.total, share: stufe.share } : null;
}
