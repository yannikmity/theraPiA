// Content-Security-Policy als Funktion der Laufzeit-Konfiguration und einer Nonce pro Anfrage. Der Proxy
// (src/proxy.ts) erzeugt die Nonce, setzt die Policy auf jede Antwort und reicht beides an Next weiter; Next hängt
// die Nonce beim Rendern an seine Skripte. So braucht script-src kein 'unsafe-inline' mehr. Ein einmal gebautes
// Image kann je Betreiber:in eine andere Umami-Herkunft erlauben. Alle anderen Security-Header bleiben statisch in
// next.config.mjs.

// Request-Header, unter dem der Proxy die Nonce an Server Components weiterreicht ((await headers()).get(NONCE_HEADER)).
export const NONCE_HEADER = "x-nonce";
// Antwort-Header; derselbe Name als Request-Header ist die Quelle, aus der Next die Nonce beim Rendern liest.
export const CSP_HEADER = "Content-Security-Policy";

// Base64 aus mindestens 16 Zeichen: nur Zeichen, die weder ein Leerzeichen noch ' oder ; enthalten – eine Nonce
// kann die Policy so nicht erweitern. Passt zu dem Muster, mit dem Next die Nonce ausliest.
const NONCE_PATTERN = /^[A-Za-z0-9+/]{16,}={0,2}$/;

export interface CspOptions {
  isDev: boolean;
  umamiScriptUrl?: string;
  nonce: string;
}

// 16 Byte aus Web Crypto (128 Bit, nicht erratbar), Base64-kodiert: 24 Zeichen. Pro Anfrage neu erzeugen.
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function umamiOrigin(scriptUrl: string | undefined): string | null {
  if (!scriptUrl) return null;
  try {
    const url = new URL(scriptUrl);
    // Nur http(s): javascript:, data:, file: & Co. hätten die Origin „null“ (bzw. gehören nie in die CSP).
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin === "null" ? null : url.origin;
  } catch {
    return null;
  }
}

export function buildCsp({ isDev, umamiScriptUrl, nonce }: CspOptions): string {
  if (!NONCE_PATTERN.test(nonce)) throw new Error("Ungültige CSP-Nonce (erwartet Base64, mindestens 16 Zeichen)");
  const extra = umamiOrigin(umamiScriptUrl);
  // Kein 'strict-dynamic': die Allowlist ist minimal ('self' + ggf. Umami) und muss wirksam bleiben, damit
  // Next-Chunks und das Umami-Script auch ohne Nonce am einzelnen Tag laden. 'unsafe-eval' nur unter next dev.
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, ...(isDev ? ["'unsafe-eval'"] : []), ...(extra ? [extra] : [])];
  const connectSrc = ["'self'", ...(extra ? [extra] : [])];
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    // Styles bewusst mit 'unsafe-inline' und ohne Nonce: style-Attribute (Radix, Feedback-Widget) und das
    // <style> des Nachweises lassen sich nicht per Nonce freigeben, und eine Nonce hier schaltete 'unsafe-inline' ab.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connectSrc.join(" ")}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
