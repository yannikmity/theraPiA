import { FEEDBACK_ID_PATTERN } from "@/lib/feedback/model";

// Umami bekommt keine Datensatz-IDs, Tokens oder Titel: UUID- und Feedback-ID-Segmente werden zu [id], Query
// und Fragment (Einladungs-/Reset-Tokens) fallen weg, der Referrer wird auf Origin + anonymisierten Pfad gekürzt.
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ID_PLACEHOLDER = "[id]";

export function sanitizePath(input: string): string {
  const path = input.split(/[?#]/, 1)[0];
  if (!path) return "/";
  return path
    .split("/")
    .map((segment) => (UUID_SEGMENT.test(segment) || FEEDBACK_ID_PATTERN.test(segment) ? ID_PLACEHOLDER : segment))
    .join("/");
}

export function sanitizeReferrer(referrer: string, ownOrigin: string): string {
  if (!referrer) return "";
  try {
    // Umami liefert eigene Verweise als relativen Pfad ("/patients/…") – gegen die eigene Origin auflösen.
    // Andere relative Angaben ("kein-url") gelten weiter als ungültig.
    const url = referrer.startsWith("/") ? new URL(referrer, ownOrigin) : new URL(referrer);
    return url.origin === ownOrigin ? `${url.origin}${sanitizePath(url.pathname)}` : url.origin;
  } catch {
    return "";
  }
}

export interface UmamiPayload {
  url?: string;
  referrer?: string;
  title?: string;
  [key: string]: unknown;
}

export function sanitizePayload<T extends UmamiPayload>(payload: T, ownOrigin: string): T {
  return {
    ...payload,
    url: sanitizePath(payload.url ?? "/"),
    referrer: sanitizeReferrer(payload.referrer ?? "", ownOrigin),
    title: undefined,
  };
}
