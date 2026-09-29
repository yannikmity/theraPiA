// @vitest-environment node
import { describe, it, expect } from "vitest";
import { authConfig } from "../auth.config";

type AuthorizedArgs = Parameters<NonNullable<typeof authConfig.callbacks.authorized>>[0];

function check(path: string, loggedIn: boolean) {
  return authConfig.callbacks.authorized({
    auth: loggedIn ? { user: { id: "u1" }, expires: "" } : null,
    request: { nextUrl: new URL(`http://localhost${path}`) },
  } as unknown as AuthorizedArgs);
}

describe("authorized", () => {
  it.each(["/api/health", "/auth/reset", "/auth/register", "/api/auth/session"])("lässt %s ohne Login zu", (path) => {
    expect(check(path, false)).toBe(true);
  });

  it("lässt das Web-App-Manifest ohne Login zu (Browser laden es ohne Cookies)", () => {
    expect(check("/manifest.json", false)).toBe(true);
  });

  it("leitet geschützte Seiten ohne Login zum Login um", () => {
    const res = check("/admin", false) as Response;
    expect(res.headers.get("location")).toBe("http://localhost/auth/login");
  });

  it("leitet eingeloggte Nutzer auf /auth/login nicht um (der Proxy kennt die Gültigkeit der Sitzung nicht)", () => {
    expect(check("/auth/login", true)).toBe(true);
  });

  it.each(["/auth/login-x", "/auth/resetting"])("behandelt %s nicht als öffentlich", (path) => {
    const res = check(path, false) as Response;
    expect(res.headers.get("location")).toBe("http://localhost/auth/login");
  });

  it.each(["/api/authors", "/api/export/csv/patients", "/api/account/export"])(
    "antwortet auf %s ohne Login mit 401 statt Umleitung (fetch/curl können keiner Login-Seite folgen)",
    async (path) => {
      const res = check(path, false) as Response;
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Nicht angemeldet" });
    }
  );
});

describe("Sitzungsdauer", () => {
  it("Sitzung läuft nach 7 Tagen ohne Nutzung ab (updateAge explizit gesetzt)", () => {
    expect(authConfig.session).toEqual({ strategy: "jwt", maxAge: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60 });
  });
});

describe("Demo-Kennzeichen in Token und Sitzung", () => {
  type JwtArgs = Parameters<NonNullable<typeof authConfig.callbacks.jwt>>[0];
  type SessionArgs = Parameters<NonNullable<typeof authConfig.callbacks.session>>[0];

  it("übernimmt demo beim Login ins Token und von dort in die Sitzung", async () => {
    const token = await authConfig.callbacks.jwt({
      token: {},
      user: { id: "u1", role: "pia", sessionVersion: 0, demo: true },
    } as unknown as JwtArgs);
    expect(token).toMatchObject({ id: "u1", role: "pia", sv: 0, demo: true });
    const session = await authConfig.callbacks.session({ session: { user: {}, expires: "" }, token } as unknown as SessionArgs);
    expect(session).toMatchObject({ user: { id: "u1", role: "pia", demo: true } });
  });

  it("setzt demo ohne Angabe auf false", async () => {
    const token = await authConfig.callbacks.jwt({ token: {}, user: { id: "u1", role: "pia", sessionVersion: 0 } } as unknown as JwtArgs);
    expect(token).toMatchObject({ demo: false });
    const session = await authConfig.callbacks.session({ session: { user: {}, expires: "" }, token } as unknown as SessionArgs);
    expect(session).toMatchObject({ user: { demo: false } });
  });
});
