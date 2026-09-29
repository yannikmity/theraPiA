import { createHash, timingSafeEqual } from "node:crypto";
import { isLocalUrl } from "./config";

// Der erste Account einer Instanz wird Admin. Ohne Schutz könnte ihn jede:r anlegen, die eine frisch
// aufgesetzte, schon öffentlich erreichbare Instanz zuerst aufruft – auch im Modus closed. Deshalb verlangt die
// Einrichtung den Code aus SETUP_TOKEN. Ausnahme: Entwicklung (kein Produktionsbuild) auf localhost ohne
// SETUP_TOKEN. Ein Produktionsbuild verlangt den Code immer – auch hinter einem Proxy mit NEXTAUTH_URL=http://localhost.
export type SetupCheck = "ok" | "wrong-code" | "missing-config";
export type SetupState = "code-required" | "blocked" | "open";

interface SetupConfig {
  SETUP_TOKEN?: string;
  NEXTAUTH_URL?: string;
}

export function setupState(config: SetupConfig, production = process.env.NODE_ENV === "production"): SetupState {
  if (config.SETUP_TOKEN) return "code-required";
  return !production && config.NEXTAUTH_URL && isLocalUrl(config.NEXTAUTH_URL) ? "open" : "blocked";
}

// Vergleich über Hashes gleicher Länge in konstanter Zeit, damit die Antwortzeit nichts über den Code verrät.
function sameToken(provided: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

export function checkSetupToken(
  config: SetupConfig,
  provided: string | undefined,
  production = process.env.NODE_ENV === "production"
): SetupCheck {
  const state = setupState(config, production);
  if (state === "open") return "ok";
  if (state === "blocked") return "missing-config";
  return provided !== undefined && sameToken(provided.trim(), config.SETUP_TOKEN!) ? "ok" : "wrong-code";
}
