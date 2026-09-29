import type { Db } from "../db";
import { loadUserData } from "../db/user-data";
import { buildNachweis, type Nachweis, type NachweisFilter } from "../nachweis";
import { firstRecordDate } from "../nachweis-periods";
import { loadRegelwerk } from "./ausbildungsregeln";

// Lädt alle Daten der Person und ihr Regelwerk und baut den Nachweis. Besitz ist über loadUserData (WHERE user_id)
// gesichert; eine fremde supervisorId endet in NotFoundError.
export async function loadNachweis(db: Db, userId: string, filter: NachweisFilter, now: Date = new Date()): Promise<Nachweis> {
  const data = await loadUserData(db, userId);
  return buildNachweis(data, filter, await loadRegelwerk(db, userId), now);
}

export interface NachweisPageData {
  nachweis: Nachweis;
  supervisors: { id: string; name: string; isActive: boolean }[];
  firstRecordDate: string | null;
  // true: die angefragte Supervisor:in gehört nicht zu diesem Account – gebaut wurde ohne Supervisor:in.
  supervisorNotFound: boolean;
}

// Alles für die Nachweis-Seite aus einem Ladevorgang: Dokument, Supervisor:innen fürs Auswahlfeld (auch inaktive –
// alte Supervisionen gehören zu ihnen) und das früheste Datum für „Ausbildung gesamt“. Eine fremde oder gelöschte
// Supervisor:in aus der Adresse ist kein Fehlerfall, sondern ein Hinweis auf der Seite.
export async function loadNachweisPage(db: Db, userId: string, filter: NachweisFilter, now: Date = new Date()): Promise<NachweisPageData> {
  const data = await loadUserData(db, userId);
  const regelwerk = await loadRegelwerk(db, userId);
  const known = filter.supervisorId === null || data.supervisors.some((s) => s.id === filter.supervisorId);
  const effective = known ? filter : { ...filter, supervisorId: null };
  return {
    nachweis: buildNachweis(data, effective, regelwerk, now),
    supervisors: data.supervisors.map(({ id, name, isActive }) => ({ id, name, isActive })),
    firstRecordDate: firstRecordDate(data),
    supervisorNotFound: !known,
  };
}
