import { describe, it, expect, vi } from "vitest";
import {
  assertThrowawayDatabase,
  CSP_VIOLATION_PREFIX,
  daysAgoIso,
  defaultBaseUrl,
  DEMO_USER,
  emulateSafeArea,
  FAB_CHECKS,
  LOW_VIEWPORT,
  nextServerCommand,
  normalizeUmamiOrigin,
  overflowWarning,
  PAGES,
  reportCspViolations,
  SCREENSHOT_USER,
  shotsPort,
  umamiProblem,
  umamiStubScript,
  VIEWPORTS,
} from "../../../scripts/screenshots-lib.mjs";

describe("Screenshot-Harness", () => {
  it("lässt nur Wegwerf-Datenbanken mit „screenshot“ im Namen zu", () => {
    expect(assertThrowawayDatabase("postgresql://u:p@localhost:5432/therapia_screenshots")).toBe(
      "therapia_screenshots"
    );
    expect(() => assertThrowawayDatabase("postgresql://u:p@localhost:5432/therapia")).toThrow(/Sicherheitsstopp/);
    expect(() => assertThrowawayDatabase("kein-url")).toThrow(/keine gültige URL/);
  });

  it("nimmt Auth-Seiten vor dem Login auf und kennt alle drei Ansichten", () => {
    const firstAuthenticated = PAGES.findIndex((p) => p.auth !== false);
    expect(firstAuthenticated).toBeGreaterThan(0);
    expect(PAGES.slice(0, firstAuthenticated).every((p) => p.auth === false)).toBe(true);
    expect(PAGES.slice(firstAuthenticated).every((p) => p.auth !== false)).toBe(true);
    expect(new Set(PAGES.map((p) => p.name)).size).toBe(PAGES.length);
    expect(VIEWPORTS.map((v) => `${v.name} ${v.width}×${v.height}`)).toEqual(["mobil 390×844", "mobil-quer 844×390", "desktop 1440×900"]);
    expect(PAGES.filter((p) => p.media !== undefined).map((p) => p.media)).toEqual(["print"]);
  });

  it("rechnet „vor n Tagen“ auf Berliner Kalendertagen – auch über die Zeitumstellungen hinweg", () => {
    // Mo 30.03.2026 00:30 MESZ, die Nacht nach der Umstellung auf Sommerzeit
    const afterSpring = new Date("2026-03-29T22:30:00Z");
    expect(daysAgoIso(0, afterSpring)).toBe("2026-03-30");
    expect(daysAgoIso(1, afterSpring)).toBe("2026-03-29");
    expect(daysAgoIso(2, afterSpring)).toBe("2026-03-28");
    // Mo 26.10.2026 23:30 MEZ, der Tag nach dem Ende der Sommerzeit
    const afterAutumn = new Date("2026-10-26T22:30:00Z");
    expect(daysAgoIso(1, afterAutumn)).toBe("2026-10-25");
    expect(daysAgoIso(2, afterAutumn)).toBe("2026-10-24");
    expect(daysAgoIso(63, afterAutumn)).toBe("2026-08-24");
    // Berliner Tag statt UTC-Tag, Jahreswechsel
    expect(daysAgoIso(1, new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31");
  });

  it("kennt die Formularseiten für die Prüfung der Feedback-Zone: eindeutige Namen, Pfad und exakter Knopfname", () => {
    expect(new Set(FAB_CHECKS.map((c) => c.name)).size).toBe(FAB_CHECKS.length);
    for (const c of FAB_CHECKS) {
      expect(c.path.startsWith("/")).toBe(true);
      expect(c.button.length).toBeGreaterThan(0);
    }
    expect(FAB_CHECKS.map((c) => c.name)).toContain("erfassen-vorschlaege");
  });

  it("warnt, wenn eine Seite breiter als der Viewport ist – nicht im Druckmedium, wo Tabellen bewusst überstehen", () => {
    const entry = { name: "dashboard", path: "/" };
    expect(overflowWarning(entry, "mobil", "http://localhost:3000/", 0)).toBeNull();
    expect(overflowWarning(entry, "mobil", "http://localhost:3000/", 24)).toEqual({
      viewport: "mobil",
      url: "http://localhost:3000/",
      text: "Seite dashboard ist 24 px breiter als der Viewport",
    });
    expect(overflowWarning({ name: "nachweis-druck", path: "/nachweis", media: "print" }, "mobil", "http://localhost:3000/nachweis", 300)).toBeNull();
  });
  it("nimmt die Demo-Seiten am Ende mit dem Demo-Account auf – ein Wechsel, fiktive Adresse", () => {
    const ersteDemo = PAGES.findIndex((p) => p.user !== undefined);
    expect(ersteDemo).toBeGreaterThan(0);
    expect(PAGES.slice(0, ersteDemo).some((p) => p.user !== undefined)).toBe(false);
    expect(PAGES.slice(ersteDemo).every((p) => p.user === DEMO_USER)).toBe(true);
    expect(PAGES.slice(ersteDemo).map((p) => p.name)).toEqual([
      "demo-dashboard",
      "demo-dashboard-prognose",
      "demo-patientinnen",
      "demo-supervision",
      "demo-gruppe-detail",
      "demo-finanzen",
      "demo-nachweis",
    ]);
    expect(DEMO_USER.email.endsWith("@example.com")).toBe(true);
    expect(DEMO_USER.email).not.toBe(SCREENSHOT_USER.email);
  });

  it("wählt den Port des Dev-Servers: --port vor SHOTS_PORT vor 3000", () => {
    expect(shotsPort(undefined, {})).toBe(3000);
    expect(shotsPort(undefined, { SHOTS_PORT: "3320" })).toBe(3320);
    expect(shotsPort("3330", { SHOTS_PORT: "3320" })).toBe(3330);
    expect(shotsPort(undefined, { SHOTS_PORT: "" })).toBe(3000);
    expect(() => shotsPort("abc", {})).toThrow(/Ungültiger Port „abc“/);
    expect(() => shotsPort("70000", {})).toThrow(/Ungültiger Port/);
    expect(defaultBaseUrl({ SHOTS_PORT: "3320" })).toBe("http://localhost:3320");
    expect(defaultBaseUrl({})).toBe("http://localhost:3000");
  });

  it("kennt die Safe-Areas je Ansicht: Handy hoch oben/unten, quer seitlich, Desktop keine", () => {
    const byName = Object.fromEntries([...VIEWPORTS, LOW_VIEWPORT].map((v) => [v.name, v.safeArea]));
    expect(byName).toEqual({
      mobil: { top: 59, right: 0, bottom: 34, left: 0 },
      "mobil-quer": { top: 0, right: 59, bottom: 21, left: 59 },
      desktop: { top: 0, right: 0, bottom: 0, left: 0 },
      "mobil-niedrig": { top: 59, right: 0, bottom: 34, left: 0 },
    });
    // Querformat liegt über md (768 px): dort gilt das Desktop-Layout mit Seitenleiste.
    expect(VIEWPORTS.find((v) => v.name === "mobil-quer")!.width).toBeGreaterThanOrEqual(768);
  });

  it("emuliert die Safe-Areas per CDP für genau die übergebene Seite", async () => {
    const sent: unknown[] = [];
    const page = {};
    const context = {
      newCDPSession: async (p: unknown) => {
        expect(p).toBe(page);
        return { send: async (method: string, params: unknown) => void sent.push([method, params]) };
      },
    };
    await emulateSafeArea(context, page, { top: 0, right: 59, bottom: 21, left: 59 });
    expect(sent).toEqual([["Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, right: 59, bottom: 21, left: 59 } }]]);
  });
});

describe("Harness – CSP und Umami", () => {
  it("meldet CSP-Verletzungen als console.error mit festem Präfix (zählt im Harness als Fehler)", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    reportCspViolations();
    const event = Object.assign(new Event("securitypolicyviolation"), {
      effectiveDirective: "script-src-elem",
      blockedURI: "inline",
      sourceFile: "http://localhost:3330/auth/login",
      lineNumber: 1,
    });
    document.dispatchEvent(event);
    expect(errors).toHaveBeenCalledWith(
      `${CSP_VIOLATION_PREFIX} script-src-elem blockiert inline (http://localhost:3330/auth/login:1)`
    );
    errors.mockRestore();
  });

  it("Umami-Stub schickt Seitenaufrufe per POST an <Origin>/api/send", () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const win = window as unknown as { umami?: { track: (arg: unknown) => void } };
    try {
      new Function(umamiStubScript("https://analytics.example.org"))();
      win.umami!.track((props: Record<string, unknown>) => ({ ...props, url: "/patients/[id]" }));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://analytics.example.org/api/send");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string).payload.url).toBe("/patients/[id]");
    } finally {
      vi.unstubAllGlobals();
      delete win.umami;
    }
  });

  it("normalisiert --umami-origin auf die Origin und bricht bei ungültiger Eingabe ab", () => {
    expect(normalizeUmamiOrigin("https://analytics.example.org")).toBe("https://analytics.example.org");
    expect(normalizeUmamiOrigin("https://analytics.example.org/")).toBe("https://analytics.example.org");
    expect(normalizeUmamiOrigin("https://analytics.example.org/script.js")).toBe("https://analytics.example.org");
    expect(normalizeUmamiOrigin("http://localhost:3001/umami/script.js")).toBe("http://localhost:3001");
    expect(() => normalizeUmamiOrigin("analytics.example.org")).toThrow(/--umami-origin.*keine gültige http\(s\)-URL/);
    expect(() => normalizeUmamiOrigin("ftp://analytics.example.org")).toThrow(/--umami-origin.*keine gültige http\(s\)-URL/);
  });

  it("meldet ein Problem, wenn das Umami-Script oder /api/send nie ankam", () => {
    expect(umamiProblem({ script: 2, send: 3 }, "https://analytics.example.org")).toBeNull();
    expect(umamiProblem({ script: 0, send: 0 }, "https://analytics.example.org")).toMatch(/Umami.*Script 0×.*api\/send 0×/);
    expect(umamiProblem({ script: 1, send: 0 }, "https://analytics.example.org")).toMatch(/api\/send 0×/);
  });
  it("startet next dev oder next start auf dem gewünschten Port mit passenden Vorgaben", () => {
    expect(nextServerCommand({ prod: false, port: 3000 })).toEqual({
      args: ["dev", "-p", "3000"],
      env: { NEXTAUTH_URL: "http://localhost:3000" },
    });
    expect(nextServerCommand({ prod: true, port: 3330 })).toEqual({
      args: ["start", "-p", "3330"],
      env: { NEXTAUTH_URL: "http://localhost:3330", AUTH_TRUST_HOST: "true", FEEDBACK_DIR: "./data/feedback" },
    });
  });
});
