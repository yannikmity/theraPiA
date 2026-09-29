// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";
import { encode } from "next-auth/jwt";
import { buildCsp } from "../csp";

// Die CSP kommt zur Laufzeit aus dem Proxy, mit einer Nonce pro Anfrage. Sie muss auf JEDER Antwort stehen (auch
// Umleitungen und 401 aus authorized() sowie statische Dateien), und bei durchgelassenen Anfragen müssen Nonce und
// CSP als Request-Header bei Next ankommen – sonst rendert Next seine Skripte ohne Nonce und der Browser blockiert sie.
const SECRET = "x".repeat(32);

async function loadProxy(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("NEXTAUTH_SECRET", SECRET);
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("@/proxy");
}

async function run(path: string, env: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const { proxy } = await loadProxy(env);
  return proxy(new NextRequest(`http://localhost:3000${path}`, { headers }), {} as NextFetchEvent);
}

function cspOf(res: Response): string {
  const csp = res.headers.get("content-security-policy");
  expect(csp).toBeTruthy();
  return csp!;
}

function nonceOf(csp: string): string {
  const match = /'nonce-([A-Za-z0-9+/]+={0,2})'/.exec(csp);
  expect(match).not.toBeNull();
  return match![1];
}

// Was NextResponse.next({ request: { headers } }) an Next weitergibt (x-middleware-request-*).
function forwarded(res: Response, name: string): string | null {
  return res.headers.get(`x-middleware-request-${name}`);
}

function overridden(res: Response): string[] {
  return (res.headers.get("x-middleware-override-headers") ?? "").split(",").filter(Boolean);
}

// Gültiges Sitzungs-Cookie (JWT wie von NextAuth). Auth.js wählt den Cookie-Namen mit oder ohne __Secure- je nach
// erkannter Herkunft – beide setzen, einer passt. Das Token trägt keine Nutzerdaten außer Test-Werten.
async function sessionCookie(): Promise<string> {
  const token = { sub: "u1", id: "u1", role: "pia", sv: 1, name: "PiA Beispiel", email: "pia@example.com" };
  const names = ["authjs.session-token", "__Secure-authjs.session-token"];
  const values = await Promise.all(names.map((salt) => encode({ token, secret: SECRET, salt })));
  return names.map((name, i) => `${name}=${values[i]}`).join("; ");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy – Content-Security-Policy mit Nonce", () => {
  it("setzt auf durchgelassene Seiten die verbindliche Policy mit Nonce und reicht Nonce und CSP an Next weiter", async () => {
    const res = await run("/auth/login");
    expect(res.headers.get("x-middleware-next")).toBe("1");
    const csp = cspOf(res);
    const nonce = nonceOf(csp);
    expect(csp).toBe(buildCsp({ isDev: false, nonce }));
    expect(csp).toContain("frame-ancestors 'none'");
    expect(forwarded(res, "x-nonce")).toBe(nonce);
    expect(forwarded(res, "content-security-policy")).toBe(csp);
    expect(overridden(res)).toEqual(expect.arrayContaining(["x-nonce", "content-security-policy"]));
  });

  it("erzeugt für jede Anfrage eine neue Nonce", async () => {
    const { proxy } = await loadProxy();
    const nonces = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const res = await proxy(new NextRequest("http://localhost:3000/auth/login"), {} as NextFetchEvent);
      const nonce = nonceOf(cspOf(res));
      expect(forwarded(res, "x-nonce")).toBe(nonce);
      nonces.add(nonce);
    }
    expect(nonces.size).toBe(20);
  });

  it("überschreibt eine vom Client mitgeschickte Nonce und CSP", async () => {
    const res = await run("/auth/login", {}, {
      "x-nonce": "AAAAAAAAAAAAAAAAAAAAAA==",
      "content-security-policy": "script-src * 'unsafe-inline'",
    });
    const csp = cspOf(res);
    expect(nonceOf(csp)).not.toBe("AAAAAAAAAAAAAAAAAAAAAA==");
    expect(forwarded(res, "x-nonce")).toBe(nonceOf(csp));
    expect(forwarded(res, "content-security-policy")).toBe(csp);
  });

  it("behält die übrigen Request-Header beim Weiterreichen", async () => {
    const res = await run("/auth/login", {}, { cookie: "beispiel=1", "accept-language": "de-DE" });
    expect(overridden(res)).toEqual(expect.arrayContaining(["cookie", "accept-language"]));
    expect(forwarded(res, "cookie")).toBe("beispiel=1");
    expect(forwarded(res, "accept-language")).toBe("de-DE");
  });

  it("behält beim Weiterreichen das erneuerte Sitzungs-Cookie aus der Anmeldeprüfung", async () => {
    const res = await run("/patients", {}, { cookie: await sessionCookie() });
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.getSetCookie().some((cookie) => /authjs\.session-token=/.test(cookie))).toBe(true);
    expect(forwarded(res, "x-nonce")).toBe(nonceOf(cspOf(res)));
  });

  it("setzt die Policy auch auf die Login-Umleitung aus authorized() – ohne Weiterreichen", async () => {
    const res = await run("/patients");
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/auth/login");
    const csp = cspOf(res);
    expect(csp).toBe(buildCsp({ isDev: false, nonce: nonceOf(csp) }));
    expect(res.headers.get("x-middleware-override-headers")).toBeNull();
  });

  it("setzt die Policy auch auf die 401-Antwort aus authorized()", async () => {
    const res = await run("/api/feedback");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Nicht angemeldet" });
    const csp = cspOf(res);
    expect(csp).toBe(buildCsp({ isDev: false, nonce: nonceOf(csp) }));
    expect(res.headers.get("x-middleware-override-headers")).toBeNull();
  });

  it.each(["/_next/static/chunks/app.js", "/_next/image", "/_next/image?url=%2Fx.png&w=64&q=75", "/favicon.ico"])(
    "lässt %s ohne Anmeldeprüfung und ohne Weiterreichen durch, aber mit Policy",
    async (path) => {
      const res = await run(path);
      expect(res.headers.get("x-middleware-next")).toBe("1");
      expect(res.headers.get("location")).toBeNull();
      expect(res.headers.get("set-cookie")).toBeNull();
      expect(res.headers.get("x-middleware-override-headers")).toBeNull();
      const csp = cspOf(res);
      expect(csp).toBe(buildCsp({ isDev: false, nonce: nonceOf(csp) }));
    }
  );

  // Die Ausnahme gilt nur bis zum Pfadende oder einem „/“: Pfade, die bloß mit demselben Präfix beginnen, laufen
  // durch die Anmeldeprüfung (ohne Sitzung Umleitung auf den Login) und bekommen die Policy.
  it.each(["/_next/staticX", "/_next/static-nicht/app.js", "/_next/imagex", "/favicon.ico-x"])(
    "prüft %s trotz gleichen Präfixes weiterhin (kein Umgehen der Anmeldung)",
    async (path) => {
      const res = await run(path);
      expect(res.status).toBe(302);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/auth/login");
      const csp = cspOf(res);
      expect(csp).toBe(buildCsp({ isDev: false, nonce: nonceOf(csp) }));
    }
  );

  it("nimmt die Umami-Herkunft zur Laufzeit aus der Umgebung auf", async () => {
    const res = await run("/patients", {
      UMAMI_SCRIPT_URL: "https://analytics.example.org/script.js",
      UMAMI_WEBSITE_ID: "11111111-1111-4111-8111-111111111111",
    });
    const csp = cspOf(res);
    expect(csp).toBe(buildCsp({ isDev: false, umamiScriptUrl: "https://analytics.example.org/script.js", nonce: nonceOf(csp) }));
    expect(csp).toContain("connect-src 'self' https://analytics.example.org;");
  });

  // Statischer Pfad, damit die Anmeldeprüfung (NextAuth mit NODE_ENV-abhängigem Verhalten) keine Rolle spielt.
  it.each([
    ["production", false],
    ["test", false],
    ["development", true],
  ])("erlaubt 'unsafe-eval' bei NODE_ENV=%s: %s", async (nodeEnv, allowed) => {
    const csp = cspOf(await run("/_next/static/chunks/app.js", { NODE_ENV: nodeEnv }));
    expect(csp.includes("'unsafe-eval'")).toBe(allowed);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("läuft auf allen Pfaden (auch /api/feedback wegen proxyClientMaxBodySize und statische Dateien)", async () => {
    const { config } = await loadProxy();
    expect(config.matcher).toEqual(["/(.*)"]);
  });
});
