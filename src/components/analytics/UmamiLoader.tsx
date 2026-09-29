import { headers } from "next/headers";
import { connection } from "next/server";
import { getConfig } from "@/lib/config";
import { NONCE_HEADER } from "@/lib/csp";
import { UmamiScript } from "./UmamiScript";

// Liest die Umami-Konfiguration zur Laufzeit: connection() beendet das Prerendering, der Rest läuft erst bei
// einer echten Anfrage – so kommt der Wert aus der Umgebung des Containers (ein Image für alle Betreiber:innen)
// und `next build` ohne Env (z. B. im Docker-Build) läuft nicht in getConfig(). Ohne Konfiguration: nichts.
// Die Nonce setzt der Proxy (src/proxy.ts) pro Anfrage; das Script lädt damit auch unter einer CSP ohne 'unsafe-inline'.
export async function UmamiLoader() {
  await connection();
  const { UMAMI_SCRIPT_URL, UMAMI_WEBSITE_ID } = getConfig();
  if (!UMAMI_SCRIPT_URL || !UMAMI_WEBSITE_ID) return null;
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;
  return <UmamiScript scriptUrl={UMAMI_SCRIPT_URL} websiteId={UMAMI_WEBSITE_ID} nonce={nonce} />;
}
