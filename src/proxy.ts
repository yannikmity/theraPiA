import NextAuth from "next-auth";
import { NextResponse, type NextFetchEvent, type NextMiddleware, type NextRequest } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { buildCsp, createNonce, CSP_HEADER, NONCE_HEADER } from "@/lib/csp";

// Next-16-Dateikonvention „proxy“ (vorher „middleware“). Läuft vor jeder Anfrage ohne Datenbank;
// welche Pfade ohne Login erreichbar sind, entscheidet authorized() in auth.config.ts.
const { auth } = NextAuth(authConfig);

// Die unveränderte Anmeldeprüfung (wie früher `export { auth as proxy }`): auth(req, ev) wertet authorized()
// aus, erneuert das Sitzungs-Cookie und gibt immer eine eigene, veränderbare Response zurück – auch für
// Umleitungen und 401. Die Typen von next-auth kennen diese Aufrufform nicht, daher der Cast.
const checkAuth = auth as unknown as NextMiddleware;

// Pfade, für die der Proxy früher per matcher gar nicht lief: keine Anmeldeprüfung, keine Weiterreichung, nur die CSP.
// Nur bis zum Pfadende oder einem „/“ – /favicon.ico-x oder /_next/staticX laufen durch die Anmeldeprüfung.
// req.nextUrl.pathname enthält keinen Query-String, /_next/image?url=… passt also.
const WITHOUT_AUTH = /^\/(_next\/static|_next\/image|favicon\.ico)(\/|$)/;

// Lässt die Anmeldeprüfung eine Anfrage durch, bekommt Next Nonce und CSP als Request-Header: Next liest die Nonce
// beim Rendern aus dem Request-Header content-security-policy und hängt sie an seine Skripte; Server Components
// lesen sie aus x-nonce. NextAuth gibt keine Request-Header weiter, deshalb eine neue Durchlass-Antwort mit allen
// Headern der NextAuth-Antwort – Set-Cookie einzeln, damit das erneuerte Sitzungs-Cookie erhalten bleibt.
// Vom Client mitgeschickte x-nonce/content-security-policy werden dabei überschrieben.
function forwardWithNonce(req: NextRequest, passed: Response, nonce: string, csp: string): Response {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set(CSP_HEADER, csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [key, value] of passed.headers) {
    if (key !== "set-cookie") response.headers.set(key, value);
  }
  for (const cookie of passed.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
  return response;
}

// Die CSP entsteht pro Anfrage: eine neue Nonce und die Umami-Herkunft aus der Umgebung (UMAMI_SCRIPT_URL ist kein
// NEXT_PUBLIC_-Wert; der Proxy läuft im Node-Runtime). Sie steht auf jeder Antwort – auch Umleitung, 401 und
// statische Dateien. next.config.mjs darf keine zweite CSP setzen. 'unsafe-eval' nur unter next dev.
export async function proxy(req: NextRequest, ev: NextFetchEvent): Promise<Response> {
  const nonce = createNonce();
  const csp = buildCsp({
    isDev: process.env.NODE_ENV === "development",
    umamiScriptUrl: process.env.UMAMI_SCRIPT_URL || undefined,
    nonce,
  });
  let response: Response;
  if (WITHOUT_AUTH.test(req.nextUrl.pathname)) {
    response = NextResponse.next();
  } else {
    const checked = (await checkAuth(req, ev)) ?? NextResponse.next();
    // Nur ein Durchlass wird gerendert; Umleitung und 401 gehen ohne Weiterreichung an den Browser.
    response = checked.headers.get("x-middleware-next") === "1" ? forwardWithNonce(req, checked, nonce, csp) : checked;
  }
  response.headers.set(CSP_HEADER, csp);
  return response;
}

export const config = {
  // Alle Pfade, auch statische Dateien (siehe oben). /api/feedback muss erfasst bleiben: mit Proxy puffert
  // Next den Request-Body bis experimental.proxyClientMaxBodySize (next.config.mjs).
  matcher: ["/(.*)"],
};
