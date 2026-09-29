// @vitest-environment node
import { describe, it, expect } from "vitest";
// Die Funktion, mit der Next beim Rendern die Nonce aus dem Request-Header liest – der Test sichert zu, dass Next
// unsere Nonce auch findet (bei einem Next-Upgrade bewusst ein Signal, falls sich der Pfad oder das Muster ändert).
import { getScriptNonceFromHeader } from "next/dist/server/app-render/get-script-nonce-from-header";
import { buildCsp, createNonce, umamiOrigin } from "../csp";

const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";

const BASE_PROD =
  `default-src 'self'; script-src 'self' 'nonce-${NONCE}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; ` +
  "font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

// Eine Direktive der Policy als Liste ihrer Quellen, z. B. directive(csp, "script-src") → ["'self'", "'nonce-…'"].
function directive(csp: string, name: string): string[] {
  const entry = csp.split(";").map((d) => d.trim()).find((d) => d.split(" ")[0] === name);
  if (!entry) throw new Error(`Direktive ${name} fehlt in: ${csp}`);
  return entry.split(" ").slice(1);
}

describe("buildCsp", () => {
  it("liefert in Produktion ohne Umami genau die verbindliche Policy", () => {
    expect(buildCsp({ isDev: false, nonce: NONCE })).toBe(BASE_PROD);
    expect(buildCsp({ isDev: false, umamiScriptUrl: undefined, nonce: NONCE })).toBe(BASE_PROD);
  });

  it("erlaubt Skripte nur aus der eigenen Herkunft und mit der Nonce – ohne 'unsafe-inline' und 'strict-dynamic'", () => {
    for (const isDev of [false, true]) {
      const scriptSrc = directive(buildCsp({ isDev, nonce: NONCE }), "script-src");
      expect(scriptSrc.slice(0, 2)).toEqual(["'self'", `'nonce-${NONCE}'`]);
      expect(scriptSrc).not.toContain("'unsafe-inline'");
      expect(scriptSrc).not.toContain("'strict-dynamic'");
    }
  });

  it("erlaubt 'unsafe-eval' nur in der Entwicklung (React-Fehlerstacks unter next dev)", () => {
    expect(directive(buildCsp({ isDev: false, nonce: NONCE }), "script-src")).not.toContain("'unsafe-eval'");
    expect(buildCsp({ isDev: true, nonce: NONCE })).toContain(`script-src 'self' 'nonce-${NONCE}' 'unsafe-eval';`);
    expect(buildCsp({ isDev: false, nonce: NONCE })).not.toContain("unsafe-eval");
  });

  it("verbietet Einbetten, Plugins, fremde base- und Formularziele", () => {
    const csp = buildCsp({ isDev: false, nonce: NONCE });
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
    expect(directive(csp, "form-action")).toEqual(["'self'"]);
    expect(directive(csp, "default-src")).toEqual(["'self'"]);
  });

  it("lässt style-src bei 'unsafe-inline' ohne Nonce (eine Nonce würde 'unsafe-inline' für Styles abschalten)", () => {
    expect(directive(buildCsp({ isDev: false, nonce: NONCE }), "style-src")).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("nimmt nur die Origin der Umami-Instanz in script-src und connect-src auf", () => {
    const csp = buildCsp({ isDev: false, umamiScriptUrl: "https://analytics.example.org/script.js?x=1", nonce: NONCE });
    expect(csp).toContain(`script-src 'self' 'nonce-${NONCE}' https://analytics.example.org;`);
    expect(csp).toContain("connect-src 'self' https://analytics.example.org;");
    expect(csp).not.toContain("/script.js");
    expect(csp).toContain("img-src 'self' data:;");
    expect(buildCsp({ isDev: true, umamiScriptUrl: "https://analytics.example.org/script.js", nonce: NONCE })).toContain(
      `script-src 'self' 'nonce-${NONCE}' 'unsafe-eval' https://analytics.example.org;`
    );
  });

  it("ignoriert eine ungültige URL", () => {
    expect(buildCsp({ isDev: false, umamiScriptUrl: "kein-url", nonce: NONCE })).toBe(BASE_PROD);
    expect(umamiOrigin("kein-url")).toBeNull();
    expect(umamiOrigin("http://localhost:3999/script.js")).toBe("http://localhost:3999");
  });

  it("ignoriert Nicht-http(s)-Schemata und die Origin „null“", () => {
    for (const bad of ["javascript:alert(1)", "data:text/javascript,1", "file:///etc/passwd", "ftp://analytics.example.org/x.js"]) {
      expect(umamiOrigin(bad)).toBeNull();
      expect(buildCsp({ isDev: false, umamiScriptUrl: bad, nonce: NONCE })).toBe(BASE_PROD);
    }
  });

  it("lehnt eine Nonce ab, die die Policy verändern könnte oder zu kurz ist", () => {
    for (const bad of ["", "kurz", "abc def ghi jkl mno pqr", "x'; script-src *", "AAAAAAAAAAAAAAAAAAAAAA==;", "ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ"]) {
      expect(() => buildCsp({ isDev: false, nonce: bad })).toThrow(/Nonce/);
    }
  });

  it("wird von Next wiedergefunden – dieselbe Nonce, die im Header steht", () => {
    const nonce = createNonce();
    expect(getScriptNonceFromHeader(buildCsp({ isDev: false, nonce }))).toBe(nonce);
    expect(getScriptNonceFromHeader(buildCsp({ isDev: true, umamiScriptUrl: "https://analytics.example.org/s.js", nonce }))).toBe(nonce);
  });
});

describe("createNonce", () => {
  it("liefert 16 Zufallsbytes als Base64 (24 Zeichen) und jedes Mal eine neue", () => {
    const nonces = Array.from({ length: 100 }, () => createNonce());
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(new Set(nonces).size).toBe(100);
  });
});
