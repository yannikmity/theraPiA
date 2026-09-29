import { z } from "zod";
import { MAX_SESSIONS_PER_BATCH, MIN_PASSWORD_LENGTH, PLANNED_SESSIONS_PER_WEEK_MAX } from "./constants";

// Gemeinsame Bausteine. Die Meldungen sind wortgleich mit den Formular-Prüfungen (components/forms/duration.ts,
// date.ts): direkte Aufrufe bekommen dieselben deutschen Texte wie die Oberfläche statt Zods englischer Standardtexte (#57).
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// abort: ein leeres Datum meldet nur „Bitte ein Datum angeben“, nicht zusätzlich das Format.
const isoDate = z.string().min(1, { error: "Bitte ein Datum angeben", abort: true }).regex(ISO_DATE, "Ungültiges Datumsformat");
const durationMinutes = z
  .number({ error: "Bitte eine Dauer angeben" })
  .int("Dauer in ganzen Minuten eingeben")
  .min(1, "Dauer muss mindestens 1 Minute sein")
  .max(480, "Dauer darf höchstens 480 Minuten sein");
const notes = z.string().max(2000);
const sessionCategory = z.enum(["sprechstunde", "probatorik", "behandlung", "bezugsperson", "gespraechsziffer"]);
const supervisionKind = z.enum(["individual", "group"]);

// Patient schemas
export const addPatientSchema = z.object({
  chiffre: z.string().min(1, "Chiffre ist erforderlich").max(50),
  therapyType: z.enum(["kurzzeittherapie", "langzeittherapie"]),
  startDate: isoDate,
});

export const updatePatientSchema = z.object({
  id: z.string().uuid(),
  chiffre: z.string().min(1, "Chiffre ist erforderlich").max(50),
  therapyType: z.enum(["kurzzeittherapie", "langzeittherapie"]),
  startDate: isoDate,
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  isActive: z.boolean(),
  antragsdatum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  beantragteStunden: z.number().int("Ganze Zahl eingeben").positive("Mindestens 1 Behandlungsstunde").nullable(),
  genehmigungsdatum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  sprechstundenAmbulanz: z.number().int("Ganze Zahl eingeben").min(0, "Mindestens 0").max(10, "Höchstens 10 Sprechstunden je Fall"),
}).refine((p) => !p.genehmigungsdatum || !p.antragsdatum || p.genehmigungsdatum >= p.antragsdatum, {
  message: "Die Genehmigung kann nicht vor dem Antrag liegen",
  path: ["genehmigungsdatum"],
});

// Session schemas
export const addTherapySessionSchema = z.object({
  patientId: z.string().uuid(),
  date: isoDate,
  durationMinutes,
  notes: notes.default(""),
  category: sessionCategory.default("behandlung"),
});

// Bearbeiten schickt jedes Feld ausdrücklich mit – keine Defaults, sonst könnte ein veralteter Client Notiz
// oder Kategorie unbemerkt auf den Standard zurücksetzen. patientId dient nur dem Nachladen der Seite nach
// dem Speichern (wie groupId bei updateGroupSessionSchema); die DB-Schicht nimmt es gar nicht an.
export const updateTherapySessionSchema = z.object({
  id: z.string().uuid(),
  patientId: z.string().uuid(),
  date: isoDate,
  durationMinutes,
  notes,
  category: sessionCategory,
});

// Sammel-Speichern („Wie letzte Woche“): jede Zeile wie eine einzelne Sitzung, begrenzt auf einen Vorschlagsblock.
export const addTherapySessionsSchema = z.object({
  sessions: z.array(addTherapySessionSchema).min(1, "Keine Sitzung ausgewählt").max(MAX_SESSIONS_PER_BATCH),
});

export const deleteTherapySessionSchema = z.object({
  id: z.string().uuid(),
  patientId: z.string().uuid(),
});

// Doppelte IDs würden beim Einfügen der Verknüpfungen am Primärschlüssel scheitern.
const uniqueUuidsRequired = z.array(z.string().uuid()).transform((ids) => [...new Set(ids)]);
const uniqueUuids = uniqueUuidsRequired.default([]);

// Verknüpfungen müssen zur Art passen: Einzelsupervision bespricht Therapiesitzungen, Gruppensupervision
// Doppelstunden. Die Formulare halten das ein; die Regel fängt manipulierte oder veraltete Clients.
type SupervisionLinks = { kind: "individual" | "group"; linkedTherapySessionIds: string[]; linkedGroupSessionIds: string[] };
const noGroupLinksForIndividual = (s: SupervisionLinks) => s.kind !== "individual" || s.linkedGroupSessionIds.length === 0;
const noTherapyLinksForGroup = (s: SupervisionLinks) => s.kind !== "group" || s.linkedTherapySessionIds.length === 0;
const INDIVIDUAL_LINKS = { error: "Eine Einzelsupervision kann keine Doppelstunden verknüpfen", path: ["linkedGroupSessionIds"] };
const GROUP_LINKS = { error: "Eine Gruppensupervision kann keine Therapiesitzungen verknüpfen", path: ["linkedTherapySessionIds"] };

export const addSupervisionSessionSchema = z
  .object({
    supervisorId: z.string().uuid(),
    date: isoDate,
    durationMinutes,
    kind: supervisionKind.default("individual"),
    linkedTherapySessionIds: uniqueUuids,
    linkedGroupSessionIds: uniqueUuids,
  })
  .refine(noGroupLinksForIndividual, INDIVIDUAL_LINKS)
  .refine(noTherapyLinksForGroup, GROUP_LINKS);

export const updateSupervisionSessionSchema = z
  .object({
    id: z.string().uuid(),
    supervisorId: z.string().uuid(),
    date: isoDate,
    durationMinutes,
    kind: supervisionKind,
    linkedTherapySessionIds: uniqueUuidsRequired,
    linkedGroupSessionIds: uniqueUuidsRequired,
  })
  .refine(noGroupLinksForIndividual, INDIVIDUAL_LINKS)
  .refine(noTherapyLinksForGroup, GROUP_LINKS);

export const deleteByIdSchema = z.object({
  id: z.string().uuid(),
});

// Von der Gruppenseite angelegt: immer eine Gruppensupervision. .safeExtend() behält die Refinements und
// erlaubt, kind einzuengen (.extend() verweigert in Zod 4 das Überschreiben von Schlüsseln mit Refinements).
export const addGroupSupervisionSessionSchema = addSupervisionSessionSchema.safeExtend({
  groupId: z.string().uuid(),
  kind: z.literal("group").default("group"),
});

// Group schemas
export const addGroupSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(100),
  startDate: isoDate,
  plannedSessionCount: z.number().int().positive(),
  avgKids: z.number().min(0).nullable(),
});

export const updateGroupSchema = addGroupSchema.extend({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export const addGroupSessionSchema = z.object({
  groupId: z.string().uuid(),
  date: isoDate,
  status: z.enum(["durchgefuehrt", "ausgefallen", "urlaub", "geplant"]),
  childCount: z.number().int().min(0).nullable(),
  countsTowardAmbulanzzeit: z.boolean().default(true),
  durationMinutes: durationMinutes.default(100),
  notes: z.string().max(2000).default(""),
});

// Bearbeiten ohne Defaults (siehe updateTherapySessionSchema); groupId nur zum Nachladen.
export const updateGroupSessionSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  date: isoDate,
  status: z.enum(["durchgefuehrt", "ausgefallen", "urlaub", "geplant"]),
  childCount: z.number().int().min(0).nullable(),
  countsTowardAmbulanzzeit: z.boolean(),
  durationMinutes,
  notes,
});

export const deleteGroupSessionSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
});

// Supervisor schemas
export const addSupervisorSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(100),
  costPerHour: z.number().min(0, "Muss 0 oder positiv sein").nullable(),
});

export const updateSupervisorSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Name ist erforderlich").max(100),
  costPerHour: z.number().min(0, "Muss 0 oder positiv sein").nullable(),
  isActive: z.boolean(),
});

// Financial settings schema. plannedSessionsPerWeek: Quartalsprognose, null = Schnitt der letzten Wochen. Fehlt das
// Feld, lässt die DB-Schicht den gespeicherten Wert stehen – kein Schreibpfad kann die Planung versehentlich löschen.
export const updateFinancialSettingsSchema = z.object({
  incomePerHour: z.number().min(0, "Muss 0 oder positiv sein"),
  supervisionCosts: z.record(z.string().uuid(), z.number().min(0)),
  plannedSessionsPerWeek: z
    .number()
    .int("Ganze Zahl")
    .min(0)
    .max(PLANNED_SESSIONS_PER_WEEK_MAX, `Höchstens ${PLANNED_SESSIONS_PER_WEEK_MAX} Sitzungen pro Woche`)
    .nullable()
    .optional(),
});

// Auth schemas
export const registerSchema = z.object({
  email: z.string().trim().email("Ungültige E-Mail-Adresse"),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein`),
  name: z.string().min(1, "Name ist erforderlich").max(100),
  invite: z.string().max(100).optional(),
});

// Admin: Einladung, optional an eine Adresse gebunden. withDemoData (#9): der Account startet mit fiktiven
// Beispieldaten und bleibt als Demo-Account gekennzeichnet – nur für PiA, ein Demo-Admin sähe die echten Accounts.
export const createInvitationSchema = z
  .object({
    email: z.string().trim().email("Ungültige E-Mail-Adresse").nullable(),
    role: z.enum(["admin", "pia"]),
    withDemoData: z.boolean().default(false),
  })
  .refine((v) => !v.withDemoData || v.role === "pia", {
    message: "Beispieldaten gibt es nur für PiA-Accounts",
    path: ["withDemoData"],
  });

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(100),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein`),
});

// Password change schema
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Aktuelles Passwort ist erforderlich"),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH, `Neues Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein`),
});

// Nachweis: Zeitraum mit beiden Grenzen inklusive, optional auf eine Supervisor:in beschränkt.
export const nachweisFilterSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    supervisorId: z.string().uuid().nullable().default(null),
  })
  .refine((f) => f.from <= f.to, { error: "„Von“ darf nicht nach „Bis“ liegen", path: ["to"] });

// Account löschen: das Passwort wird im Service geprüft (deleteOwnAccount), hier nur „nicht leer“.
export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Passwort ist erforderlich"),
});

// Type inference helpers
export type AddPatientInput = z.infer<typeof addPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type AddTherapySessionInput = z.infer<typeof addTherapySessionSchema>;
export type AddTherapySessionsInput = z.infer<typeof addTherapySessionsSchema>;
export type AddSupervisionSessionInput = z.infer<typeof addSupervisionSessionSchema>;
export type UpdateTherapySessionInput = z.infer<typeof updateTherapySessionSchema>;
export type UpdateSupervisionSessionInput = z.infer<typeof updateSupervisionSessionSchema>;
export type AddSupervisorInput = z.infer<typeof addSupervisorSchema>;
export type UpdateSupervisorInput = z.infer<typeof updateSupervisorSchema>;
export type UpdateFinancialSettingsInput = z.infer<typeof updateFinancialSettingsSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type AddGroupInput = z.infer<typeof addGroupSchema>;
export type AddGroupSupervisionSessionInput = z.infer<typeof addGroupSupervisionSessionSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type AddGroupSessionInput = z.infer<typeof addGroupSessionSchema>;
export type UpdateGroupSessionInput = z.infer<typeof updateGroupSessionSchema>;
export type NachweisFilterInput = z.infer<typeof nachweisFilterSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
