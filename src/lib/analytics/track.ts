import type { ActionResult } from "@/lib/action-result";
import type { Sentiment } from "@/lib/feedback/model";
import type { LoginErrorCode } from "@/lib/login-errors";
import type { SupervisionKind } from "@/types";
import { sanitizePath, sanitizePayload, sanitizeReferrer, type UmamiPayload } from "./sanitize";

// Event-Katalog (snake_case, keine PII). Dokumentiert in docs/betrieb/analytics.md – dort zuerst ergänzen,
// dann hier. Pageviews laufen über trackPageview() (manuell, siehe UmamiScript), damit jede URL anonymisiert wird.
export const EVENTS = {
  loginSuccess: "login_success",
  loginFailed: "login_failed",
  therapySessionSaved: "therapy_session_saved",
  supervisionSaved: "supervision_saved",
  patientCreated: "patient_created",
  entryDeleted: "entry_deleted",
  actionFailed: "action_failed",
  feedbackOpened: "feedback_opened",
  feedbackSaved: "feedback_saved",
  nachweisPrinted: "nachweis_printed",
  exportDownloaded: "export_downloaded",
  accountDeleted: "account_deleted",
  quickCaptureUsed: "quick_capture_used",
  lastWeekSuggestionsApplied: "last_week_suggestions_applied",
  dashboardForecastViewed: "dashboard_forecast_viewed",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
export type EventData = Record<string, string | number | boolean>;
export type Entity = "therapy_session" | "supervision" | "group_session" | "patient";
export type ActionKind = "create" | "update" | "delete";
export type FailureCategory = "validation" | "error";
export type SaveMode = "new" | "edit";
// Datenarten der Downloads unter Profil → Meine Daten (fünf CSV-Dateien und der JSON-Datenexport); `expenses` auch unter Finanzen.
export type ExportEntity = "therapy_sessions" | "supervisions" | "group_sessions" | "patients" | "expenses" | "json";
// Einstiegspunkte des Schnelleinstiegs „+ Sitzung“ (Dashboard-Zeile, Kopf der Patient:innen-Seite).
export type QuickCaptureSource = "dashboard" | "patient";

// Erlaubte Daten je Event: nur feste Kataloge, Booleans und Anzahlen – nie IDs, Chiffren, Namen, Fehlermeldungen oder
// Element-Beschriftungen. `undefined` = Event ohne Daten. Der Compiler lehnt alles andere an den Aufrufstellen ab.
export type EventProps = {
  login_success: undefined;
  login_failed: { reason: LoginErrorCode };
  therapy_session_saved: { mode: SaveMode };
  supervision_saved: { mode: SaveMode; kind: SupervisionKind };
  patient_created: undefined;
  entry_deleted: { entity: Entity };
  action_failed: { entity: Entity; action: ActionKind; category: FailureCategory };
  feedback_opened: undefined;
  feedback_saved: { sentiment: Sentiment; screenshot: boolean };
  nachweis_printed: { supervisor: boolean };
  export_downloaded: { entity: ExportEntity };
  account_deleted: undefined;
  quick_capture_used: { source: QuickCaptureSource };
  last_week_suggestions_applied: { count: number };
  dashboard_forecast_viewed: undefined;
};

// Katalog und Datentypen müssen dieselben Events kennen.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const catalogMatchesProps: Exact<EventName, keyof EventProps> = true;
void catalogMatchesProps;

// Laufzeit-Allowlist je Event. EventProps prüft nur zur Compilezeit; ein Aufruf mit Cast oder aus altem JavaScript
// könnte trotzdem Fremdes anhängen (Chiffre, Adresse). Hier bleiben nur die bekannten Felder mit einfachen Werten.
// Neue Felder: zuerst docs/betrieb/analytics.md, dann EventProps, dann hier – der Test vergleicht die Liste.
// Typ: je Event nur Schlüssel aus EventProps – ein Tippfehler in der Liste fällt in tsc auf.
type EventFields = { [E in EventName]: EventProps[E] extends undefined ? readonly [] : readonly (keyof EventProps[E])[] };

export const EVENT_FIELDS: EventFields = {
  login_success: [],
  login_failed: ["reason"],
  therapy_session_saved: ["mode"],
  supervision_saved: ["mode", "kind"],
  patient_created: [],
  entry_deleted: ["entity"],
  action_failed: ["entity", "action", "category"],
  feedback_opened: [],
  feedback_saved: ["sentiment", "screenshot"],
  nachweis_printed: ["supervisor"],
  export_downloaded: ["entity"],
  account_deleted: [],
  quick_capture_used: ["source"],
  last_week_suggestions_applied: ["count"],
  dashboard_forecast_viewed: [],
};

function allowedData(event: EventName, data: unknown): EventData {
  const out: EventData = {};
  // Unbekannte Namen (auch "__proto__", "constructor" aus ungetyptem Code) haben keine erlaubten Felder – nie werfen.
  const fields: readonly string[] = Object.hasOwn(EVENT_FIELDS, event) ? EVENT_FIELDS[event] : [];
  if (!data || typeof data !== "object") return out;
  const record = data as Record<string, unknown>;
  for (const key of fields) {
    if (!Object.hasOwn(record, key)) continue;
    const value = record[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") out[key] = value;
  }
  return out;
}

type EventArgs<E extends EventName> = EventProps[E] extends undefined ? [] : [data: EventProps[E]];

type UmamiTrack = (payload: string | UmamiPayload | ((props: UmamiPayload) => UmamiPayload), data?: EventData) => unknown;

declare global {
  interface Window {
    umami?: { track: UmamiTrack };
  }
}

// Funktionsform von umami.track: Umami liefert das Standard-Payload (url, referrer, title, …), wir geben es
// anonymisiert zurück – das funktioniert seit Umami v2.0 und unabhängig von data-before-send.
// url und referrer aus props sind bei data-auto-track="false" unbrauchbar: Der Tracker aktualisiert sie nur über
// eigene History-Hooks, die er dann nicht installiert – props.url bliebe die Landing-URL. Deshalb kommt die URL
// immer aus der aktuellen Adresse, der Referrer von Soft-Navigationen aus dem vorherigen Pageview, beim ersten
// Pageview aus document.referrer. Beides steht beim Aufruf fest, nicht erst, wenn der Tracker den Builder aufruft.
let lastPath: string | undefined; // anonymisierter Pfad des letzten Pageviews (Referrer der nächsten Seite)
let pageReferrer: string | undefined; // anonymisierter Referrer der aktuellen Seite, auch für deren Events

// Referrer beim Hard-Load: fremde Seiten nur als Origin, eigene als Origin + anonymisierter Pfad.
function documentReferrer(): string {
  return sanitizeReferrer(document.referrer, window.location.origin);
}

function send(build: (props: UmamiPayload) => UmamiPayload): void {
  try {
    if (typeof window === "undefined" || !window.umami) return;
    const { origin, pathname } = window.location;
    window.umami.track((props) => build(sanitizePayload({ ...props, url: pathname }, origin)));
  } catch {
    // bewusst geschluckt – Tracking ist best-effort und darf die App nie stören
  }
}

export function track<E extends EventName>(event: E, ...[data]: EventArgs<E>): void {
  if (typeof window === "undefined") return;
  const referrer = pageReferrer ?? documentReferrer();
  const eventData = allowedData(event, data);
  send((props) => ({ ...props, referrer, name: event, data: eventData }));
}

export function trackPageview(): void {
  if (typeof window === "undefined") return;
  const previous = lastPath;
  lastPath = sanitizePath(window.location.pathname);
  const referrer = previous === undefined ? documentReferrer() : `${window.location.origin}${previous}`;
  pageReferrer = referrer;
  send((props) => ({ ...props, referrer }));
}

// Fehlgeschlagene Server Actions: nur Entität, Aktion und Kategorie – nie die Fehlermeldung (kann Chiffren enthalten).
export function trackFailure(entity: Entity, action: ActionKind, result: ActionResult<unknown>): void {
  if (result.success) return;
  track("action_failed", { entity, action, category: result.fieldErrors ? "validation" : "error" });
}
