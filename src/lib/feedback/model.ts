// Gemeinsame Konstanten und Typen des Feedback-Widgets. Bewusst ohne node:fs, damit Client-Komponenten
// (Widget) und Server (Store, Route, Admin-Seiten) dieselben Werte importieren können.

export const SENTIMENTS = ["positiv", "negativ", "wunsch"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  positiv: "Gefällt mir",
  negativ: "Stört mich",
  wunsch: "Wunsch",
};

export const FEEDBACK_TEXT_MAX = 4000;
export const SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024;
// Base64 ist 4/3 so groß wie das PNG; Widget (Vorprüfung) und Decoder nutzen dieselbe Grenze.
export const SCREENSHOT_DATA_URL_MAX = Math.ceil((SCREENSHOT_MAX_BYTES * 4) / 3) + 64;
// Obergrenze für den JSON-Body von POST /api/feedback (Screenshot + Text + Rahmen).
export const FEEDBACK_BODY_MAX_BYTES = 12 * 1024 * 1024;

// Dateiname = ID: sortierbarer Zeitstempel plus Zufall, kein Nutzerbezug. Nur dieses Muster darf Pfade
// bilden – damit ist Path-Traversal über die ID ausgeschlossen.
export const FEEDBACK_ID_PATTERN = /^\d{8}-\d{6}-[0-9a-f]{8}$/;

export function isFeedbackId(value: unknown): value is string {
  return typeof value === "string" && FEEDBACK_ID_PATTERN.test(value);
}

export interface FeedbackUser {
  id: string;
  email: string;
  name: string;
}

export interface FeedbackInput {
  page: string;
  element: string;
  selector: string;
  sentiment: Sentiment;
  text: string;
  viewport: string;
  userAgent: string;
  screenshotPng: Buffer | null;
}

export interface FeedbackMeta {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  page: string;
  element: string;
  selector: string;
  sentiment: Sentiment;
  screenshot: boolean;
  viewport: string;
  userAgent: string;
  createdAt: string;
}

export interface FeedbackItem {
  meta: FeedbackMeta;
  text: string;
}
