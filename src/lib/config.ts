import { z } from "zod";

function isPlaceholderHost(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false; // ungültige URLs meldet bereits .url()
  }
  return ["example.org", "example.com"].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

const LOCALHOST_HTTP = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/;
const HTTPS_ONLY = "muss mit https:// beginnen (Ausnahme: localhost)";

function isHttpsOrLocalhost(url: string): boolean {
  return url.startsWith("https://") || LOCALHOST_HTTP.test(url);
}

// In Produktion gibt es keinen Default: Einladungs- und Reset-Links werden aus NEXTAUTH_URL gebaut,
// ein vergessener Platzhalter oder http:// würde unbrauchbare bzw. unsichere Links erzeugen.
const productionUrl = z
  .string({ error: "fehlt (in Produktion Pflicht)" })
  .url("muss eine gültige URL sein")
  .refine(isHttpsOrLocalhost, HTTPS_ONLY)
  .refine(
    (url) => !isPlaceholderHost(url),
    "enthält noch den Platzhalter example.org/example.com – eigene Domain eintragen"
  );

// Die Origin landet in der CSP (script-src/connect-src): nur http(s), in Produktion nur https (wie NEXTAUTH_URL).
function umamiScriptUrl(production: boolean) {
  const url = z
    .string()
    .url("muss eine gültige URL sein (…/script.js)")
    .refine((value) => /^https?:\/\//i.test(value), "muss mit https:// oder http:// beginnen");
  return (production ? url.refine(isHttpsOrLocalhost, HTTPS_ONLY) : url).optional();
}

function configSchema(production: boolean) {
  return z
    .object({
      DATABASE_URL: z.string({ error: "fehlt" }).min(1, "fehlt"),
      NEXTAUTH_SECRET: z.string({ error: "fehlt" }).min(32, "muss mindestens 32 Zeichen haben"),
      NEXTAUTH_URL: production ? productionUrl : z.string().url().default("http://localhost:3010"),
      REGISTRATION_MODE: z.enum(["open", "invite", "closed"]).default("invite"),
      // Ablage des Feedback-Widgets (Markdown + PNG). Im Container ein Volume, lokal ein git-ignorierter Ordner.
      FEEDBACK_DIR: z.string().min(1).default(production ? "/data/feedback" : "./data/feedback"),
      // Optionale Nutzungsstatistik mit einer eigenen Umami-Instanz – zur Laufzeit gelesen (kein NEXT_PUBLIC_),
      // damit ein Image für alle Betreiber:innen reicht. Beide leer = kein Script, keine CSP-Änderung.
      UMAMI_SCRIPT_URL: umamiScriptUrl(production),
      UMAMI_WEBSITE_ID: z.string().uuid("muss die Website-ID (UUID) aus dem Umami-Dashboard sein").optional(),
    })
    .refine((config) => Boolean(config.UMAMI_SCRIPT_URL) === Boolean(config.UMAMI_WEBSITE_ID), {
      path: ["UMAMI_WEBSITE_ID"],
      message: "UMAMI_SCRIPT_URL und UMAMI_WEBSITE_ID nur gemeinsam setzen",
    });
}

export type AppConfig = z.infer<ReturnType<typeof configSchema>>;

export function parseConfig(env: Record<string, string | undefined>): AppConfig {
  // Leere Werte (z. B. `REGISTRATION_MODE=` in der .env) gelten als nicht gesetzt, damit die Defaults greifen.
  const withoutEmpty = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ""));
  const result = configSchema(env.NODE_ENV === "production").safeParse(withoutEmpty);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Ungültige Konfiguration – ${details}`);
  }
  return result.data;
}

let cached: AppConfig | undefined;

export function getConfig(): AppConfig {
  cached ??= parseConfig(process.env);
  return cached;
}
