import type { Group, GroupSession, Patient, Supervisor, SupervisionSession, TherapySession } from "@/types";
import type { CreatedInvitation, UserAccount, UserData } from "../db/user-data";
import type { RegelAbweichungen } from "../ausbildungsregeln/model";

// Datenexport nach Art. 20 DSGVO: alle personenbezogenen Daten eines Accounts in einem JSON-Dokument.
// Feldnamen entsprechen den Typen in src/types (camelCase, englisch). `format` und `version` machen die
// Form erkennbar; ändern sich Felder, steigt die Version. Beschreibung: docs/betrieb/datenschutz.md.
// Nicht enthalten: Passwort-Hash, Reset-Links, Einladungs-Tokens.
export const DATA_EXPORT_FORMAT = "therapia-datenexport";
// Version 2 (#8): persönliche Ausbildungsregeln (ausbildungsregelnAbweichungen).
// Version 3 (#66): Patient:innen mit genehmigungsdatum und sprechstundenAmbulanz.
export const DATA_EXPORT_VERSION = 3;

export interface DataExport {
  format: typeof DATA_EXPORT_FORMAT;
  version: typeof DATA_EXPORT_VERSION;
  exportedAt: string;
  account: UserAccount;
  patients: Patient[];
  supervisors: Supervisor[];
  therapySessions: TherapySession[];
  supervisionSessions: SupervisionSession[];
  groups: Group[];
  groupSessions: GroupSession[];
  financialSettings: { incomePerHour: number };
  ausbildungsregelnAbweichungen: RegelAbweichungen | null; // null = keine persönlichen Abweichungen
  createdInvitations: CreatedInvitation[];
}

export function buildDataExport(
  data: UserData,
  createdInvitations: CreatedInvitation[],
  ausbildungsregelnAbweichungen: RegelAbweichungen | null,
  now: Date = new Date()
): DataExport {
  return {
    format: DATA_EXPORT_FORMAT,
    version: DATA_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    account: data.account,
    patients: data.patients,
    supervisors: data.supervisors,
    therapySessions: data.therapySessions,
    supervisionSessions: data.supervisionSessions,
    groups: data.groups,
    groupSessions: data.groupSessions,
    financialSettings: data.financialSettings,
    ausbildungsregelnAbweichungen,
    createdInvitations,
  };
}
