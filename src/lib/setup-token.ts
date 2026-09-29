import { createHash, timingSafeEqual } from "node:crypto";
import { isLocalUrl } from "./config";

// Der erste Account einer Instanz wird Admin. Ohne Schutz könnte ihn jede:r anlegen, die eine frisch
// aufgesetzte, schon öffentlich erreichbare Instanz zuerst aufruft – auch im Modus closed. Deshalb verlangt die
// Einrichtung den Code aus SETUP_TOKEN. Ausnahme: eine lokale Instanz (localhost) ohne SETUP_TOKEN, damit
// Entwicklung und Screenshot-Harness ohne Zusatzschritt laufen.
export type SetupCheck = "ok" | "wrong-code" | "missing-config";
export type SetupState = "code-required" | "blocked" | "open";

interface SetupConfig {
  SETUP_TOKEN?: string;
  NEXTAUTH_URL?: string;
}

export function setupState(config: SetupConfig): SetupState {
  if (config.SETUP_TOKEN) return "code-required";
  return config.NEXTAUTH_URL && isLocalUrl(config.NEXTAUTH_URL) ? "open" : "blocked";
}

// Vergleich über Hashes gleicher Länge in konstanter Zeit, damit die Antwortzeit nichts über den Code verrät.
function sameToken(provided: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

export function checkSetupToken(config: SetupConfig, provided: string | undefined): SetupCheck {
  const state = setupState(config);
  if (state === "open") return "ok";
  if (state === "blocked") return "missing-config";
  return provided !== undefined && sameToken(provided.trim(), config.SETUP_TOKEN!) ? "ok" : "wrong-code";
}
