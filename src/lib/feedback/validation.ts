import { z } from "zod";
import { FEEDBACK_TEXT_MAX, SCREENSHOT_DATA_URL_MAX, SCREENSHOT_MAX_BYTES, SENTIMENTS } from "./model";

// Body von POST /api/feedback. Die Person kommt NICHT aus dem Body (Sitzung), der Screenshot als PNG-Data-URL.
export const feedbackPayloadSchema = z.object({
  page: z.string().max(300),
  element: z.string().max(120),
  selector: z.string().max(600),
  sentiment: z.enum(SENTIMENTS),
  text: z.string().trim().min(1, "Bitte Feedback eingeben").max(FEEDBACK_TEXT_MAX, "Feedback ist zu lang"),
  viewport: z.string().max(12).default(""),
  screenshot: z.string().nullable().default(null),
});

export type FeedbackPayload = z.infer<typeof feedbackPayloadSchema>;

const DATA_URL_PREFIX = "data:image/png;base64,";
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

// Liefert das PNG oder null. null heißt: Text-Feedback wird ohne Bild gespeichert – ein defektes oder zu großes
// Bild darf das Feedback nicht verhindern. Größe wird vor dem Dekodieren geprüft (kein 100-MB-Buffer).
export function decodeScreenshot(dataUrl: string | null | undefined): Buffer | null {
  if (!dataUrl || !dataUrl.startsWith(DATA_URL_PREFIX) || dataUrl.length > SCREENSHOT_DATA_URL_MAX) return null;
  const base64 = dataUrl.slice(DATA_URL_PREFIX.length);
  if (!BASE64.test(base64)) return null;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > SCREENSHOT_MAX_BYTES || bytes.length < PNG_MAGIC.length) return null;
  if (!bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) return null;
  return bytes;
}
