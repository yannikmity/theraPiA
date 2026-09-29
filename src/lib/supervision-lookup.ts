import type { SupervisionSession, Supervisor } from "@/types";

export interface SupervisionRef {
  id: string;
  date: string;
  supervisorName: string;
}

export interface SupervisionLookup {
  forTherapySession(id: string): SupervisionRef[];
  forGroupSession(id: string): SupervisionRef[];
}

// Welche Supervisionen haben eine Sitzung bzw. Doppelstunde besprochen? Nachweis und CSV zeigen an
// der Sitzung das Datum der Supervision und den Namen der Supervisor:in.
export function supervisionLookup(supervisionSessions: SupervisionSession[], supervisors: Supervisor[]): SupervisionLookup {
  const names = new Map(supervisors.map((s): [string, string] => [s.id, s.name]));
  const byTherapy = new Map<string, SupervisionRef[]>();
  const byGroup = new Map<string, SupervisionRef[]>();
  const add = (map: Map<string, SupervisionRef[]>, key: string, ref: SupervisionRef) => {
    const list = map.get(key) ?? [];
    list.push(ref);
    map.set(key, list);
  };
  for (const sv of supervisionSessions) {
    const ref: SupervisionRef = { id: sv.id, date: sv.date, supervisorName: names.get(sv.supervisorId) ?? "" };
    for (const id of sv.linkedTherapySessionIds) add(byTherapy, id, ref);
    for (const id of sv.linkedGroupSessionIds) add(byGroup, id, ref);
  }
  const sorted = (list: SupervisionRef[] | undefined) => [...(list ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  return {
    forTherapySession: (id) => sorted(byTherapy.get(id)),
    forGroupSession: (id) => sorted(byGroup.get(id)),
  };
}
