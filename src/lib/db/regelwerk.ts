import { db } from "../db";
import type { Regelwerk } from "../ausbildungsregeln/model";
import { loadRegelwerk } from "../services/ausbildungsregeln";
import { getCurrentUserId } from "./get-current-user";

// Regelwerk der angemeldeten Person für Seiten und Actions: Instanzprofil, persönliche Abweichungen, EBM-Staffeln.
// Bewusst nicht in db/index.ts re-exportiert: Tests, die ../db nur mit `query` mocken, laden es so nicht mit.
export async function getCurrentRegelwerk(): Promise<Regelwerk> {
  return loadRegelwerk(db, await getCurrentUserId());
}
