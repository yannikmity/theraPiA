import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type TrackModule = typeof import("../analytics/track");

const ID = "3f9a1c2b-7d4e-4a6b-8c1d-0e2f3a4b5c6d";
type Fn = (props: Record<string, unknown>) => Record<string, unknown>;

describe("track", () => {
  const umamiTrack = vi.fn();
  // Frisches Modul je Test: lastPath/pageReferrer dürfen nicht von einem Test in den nächsten wandern.
  let mod: TrackModule;
  const origin = () => window.location.origin;
  const payloadOf = (call: number, props: Record<string, unknown> = { website: "w", url: "/", referrer: "", title: "T" }) =>
    (umamiTrack.mock.calls[call][0] as Fn)(props);

  function setDocumentReferrer(value: string) {
    Object.defineProperty(document, "referrer", { value, configurable: true });
  }

  beforeEach(async () => {
    vi.resetModules();
    mod = await import("../analytics/track");
    umamiTrack.mockReset();
    window.umami = { track: umamiTrack };
    setDocumentReferrer("");
    window.history.replaceState(null, "", `/patients/${ID}?x=1#f`);
  });
  afterEach(() => {
    delete window.umami;
    setDocumentReferrer("");
  });

  it("sendet Events in Funktionsform mit anonymisierter URL, Name und Daten", () => {
    mod.track("entry_deleted", { entity: "patient" });
    expect(umamiTrack).toHaveBeenCalledTimes(1);
    expect(payloadOf(0, { website: "w", url: `/patients/${ID}?x=1`, referrer: "", title: "T" })).toEqual({
      website: "w",
      url: "/patients/[id]",
      referrer: "",
      title: undefined,
      name: "entry_deleted",
      data: { entity: "patient" },
    });
  });

  it("sendet Events ohne Daten mit leerem data-Objekt", () => {
    mod.track("login_success");
    expect(payloadOf(0)).toMatchObject({ name: "login_success", data: {} });
  });

  it("sendet bei den Vorschlägen nur die Anzahl", () => {
    mod.track("last_week_suggestions_applied", { count: 3 });
    expect(payloadOf(0)).toMatchObject({ name: "last_week_suggestions_applied", data: { count: 3 } });
  });

  it("sendet Pageviews ohne Namen", () => {
    mod.trackPageview();
    expect(payloadOf(0, { website: "w", url: `/patients/${ID}?x=1`, referrer: "", title: "T" })).toEqual({
      website: "w",
      url: "/patients/[id]",
      referrer: "",
      title: undefined,
    });
  });

  it("ist ohne umami und bei Fehlern ein No-Op", () => {
    delete window.umami;
    expect(() => mod.track("login_success")).not.toThrow();
    window.umami = {
      track: () => {
        throw new Error("kaputt");
      },
    };
    expect(() => mod.track("login_success")).not.toThrow();
  });

  it("trackFailure meldet Kategorie validation bei Feldfehlern, sonst error, und nie die Meldung", () => {
    mod.trackFailure("patient", "create", { success: false, error: "Chiffre A-1 existiert bereits", fieldErrors: { chiffre: ["doppelt"] } });
    mod.trackFailure("supervision", "delete", { success: false, error: "Supervision nicht gefunden" });
    mod.trackFailure("patient", "update", { success: true, data: undefined });
    expect(umamiTrack).toHaveBeenCalledTimes(2);
    const first = payloadOf(0);
    const second = payloadOf(1);
    expect(first).toMatchObject({ name: "action_failed", data: { entity: "patient", action: "create", category: "validation" } });
    expect(second).toMatchObject({ name: "action_failed", data: { entity: "supervision", action: "delete", category: "error" } });
    expect(JSON.stringify([first, second])).not.toContain("existiert");
  });

  it("erlaubt je Event nur die Katalogwerte (vom Compiler geprüft, tsc --noEmit)", () => {
    // Wird nie ausgeführt – die @ts-expect-error-Zeilen schlagen in tsc fehl, sobald ein Aufruf wieder kompiliert.
    const typeChecks = () => {
      mod.track("login_failed", { reason: "rate_limited" });
      mod.track("supervision_saved", { mode: "new", kind: "group" });
      mod.track("feedback_saved", { sentiment: "wunsch", screenshot: false });
      mod.track("nachweis_printed", { supervisor: true });
      mod.track("export_downloaded", { entity: "json" });
      mod.track("account_deleted");
      mod.track("quick_capture_used", { source: "dashboard" });
      mod.track("last_week_suggestions_applied", { count: 3 });
      mod.track("dashboard_forecast_viewed");
      // @ts-expect-error nur die festen Einstiegspunkte, kein Pfad
      mod.track("quick_capture_used", { source: "/patients/[id]" });
      // @ts-expect-error count ist eine Zahl, keine Liste von IDs
      mod.track("last_week_suggestions_applied", { count: [ID] });
      // @ts-expect-error die Prognose-Ansicht hat keine Daten
      mod.track("dashboard_forecast_viewed", { quarter: "2026 Q3" });
      // @ts-expect-error nur die Datenarten des Exports, keine Dateinamen
      mod.track("export_downloaded", { entity: "therapia-datenexport-2026-09-26.json" });
      // @ts-expect-error nachweis_printed braucht das Flag
      mod.track("nachweis_printed");
      // @ts-expect-error freie Texte (z. B. eine Adresse) sind kein Grund
      mod.track("login_failed", { reason: "pia@example.com" });
      // @ts-expect-error login_failed braucht eine Kategorie
      mod.track("login_failed");
      // @ts-expect-error keine zusätzlichen Felder (z. B. eine Chiffre)
      mod.track("entry_deleted", { entity: "patient", chiffre: "A-1" });
      // @ts-expect-error keine Datensatz-IDs als Entität
      mod.track("entry_deleted", { entity: ID });
      // @ts-expect-error Events ohne Daten nehmen keine Daten an
      mod.track("login_success", { email: "pia@example.com" });
      // @ts-expect-error unbekannte Events gibt es nicht
      mod.track("custom_event");
      // @ts-expect-error nur die Sentiments aus dem Modell
      mod.track("feedback_saved", { sentiment: "super", screenshot: true });
      // @ts-expect-error screenshot ist ein Boolean
      mod.track("feedback_saved", { sentiment: "positiv", screenshot: "ja" });
    };
    expect(typeof typeChecks).toBe("function");
  });

  // Der echte Umami-Tracker aktualisiert url/referrer nur über eigene History-Hooks, die er bei
  // data-auto-track="false" nicht installiert: props.url bleibt die Landing-URL. Diese Tests bilden genau das nach.
  describe("wie der echte Tracker (veraltete url und veralteter Referrer in props)", () => {
    const staleProps = () => ({ website: "w", url: "http://localhost:3000/auth/login?token=abc", referrer: `/patients/${ID}?x=1`, title: "T" });
    const stale = (call: number) => payloadOf(call, staleProps());

    it("nimmt die URL immer aus der aktuellen Adresse, nicht aus props.url", () => {
      window.history.replaceState(null, "", `/patients/${ID}?tab=1#x`);
      mod.trackPageview();
      mod.track("entry_deleted", { entity: "patient" });
      expect(stale(0).url).toBe("/patients/[id]");
      expect(stale(1)).toMatchObject({ url: "/patients/[id]", name: "entry_deleted" });
    });

    it("erster Pageview: eigener Referrer aus document.referrer wird anonymisiert", () => {
      setDocumentReferrer(`${origin()}/patients/${ID}?x=1#f`);
      window.history.replaceState(null, "", "/patients");
      mod.trackPageview();
      expect(stale(0)).toEqual({ website: "w", url: "/patients", referrer: `${origin()}/patients/[id]`, title: undefined });
    });

    it("erster Pageview: fremder Referrer bleibt auf die Origin gekürzt", () => {
      setDocumentReferrer("https://mail.example.org/inbox/123");
      window.history.replaceState(null, "", "/auth/login");
      mod.trackPageview();
      expect(stale(0).referrer).toBe("https://mail.example.org");
    });

    it("der Referrer steht beim Aufruf fest – unabhängig davon, ob und wann der Tracker den Builder aufruft", () => {
      setDocumentReferrer("https://mail.example.org/inbox/123");
      window.history.replaceState(null, "", "/auth/login");
      mod.trackPageview();
      mod.track("login_failed", { reason: "credentials" });
      // Event-Builder zuerst, Pageview-Builder nie ausgewertet: das Event trägt trotzdem den Referrer der Seite.
      expect(payloadOf(1, { url: "/x", referrer: "" })).toMatchObject({ referrer: "https://mail.example.org", name: "login_failed" });
      setDocumentReferrer("https://anders.example.net/");
      expect(stale(0).referrer).toBe("https://mail.example.org");
      expect(stale(0).referrer).toBe("https://mail.example.org");
    });

    it("Soft-Navigationen: Referrer ist der vorherige anonymisierte App-Pfad, Events erben den Referrer der Seite", () => {
      window.history.replaceState(null, "", "/patients");
      mod.trackPageview();
      stale(0);
      window.history.pushState(null, "", `/patients/${ID}?tab=2`);
      mod.trackPageview();
      expect(stale(1)).toMatchObject({ url: "/patients/[id]", referrer: `${origin()}/patients`, title: undefined });
      mod.track("entry_deleted", { entity: "therapy_session" });
      expect(stale(2)).toMatchObject({ url: "/patients/[id]", referrer: `${origin()}/patients`, name: "entry_deleted" });
      window.history.pushState(null, "", "/supervision");
      mod.trackPageview();
      expect(stale(3)).toMatchObject({ url: "/supervision", referrer: `${origin()}/patients/[id]` });
    });
  });

  it("lässt zur Laufzeit je Event nur die bekannten Felder mit einfachen Werten durch", () => {
    // `as never`: absichtlich am Compiler vorbei – so sähe ein Aufruf aus altem JavaScript oder mit Cast aus.
    mod.track("entry_deleted", { entity: "patient", chiffre: "A-1", nested: { id: ID } } as never);
    expect(payloadOf(0)).toMatchObject({ name: "entry_deleted" });
    expect(payloadOf(0).data).toEqual({ entity: "patient" });
    // Events ohne Daten haben keinen zweiten Parameter – dafür die Funktion selbst am Compiler vorbei aufrufen.
    (mod.track as (event: string, data?: unknown) => void)("login_success", { email: "pia@example.com" });
    expect(payloadOf(1)).toMatchObject({ name: "login_success" });
    expect(payloadOf(1).data).toEqual({});
    mod.track("last_week_suggestions_applied", { count: [ID] } as never);
    expect(payloadOf(2)).toMatchObject({ name: "last_week_suggestions_applied" });
    expect(payloadOf(2).data).toEqual({});
  });

  it("unbekannte Event-Namen (auch __proto__, constructor) werfen nicht und senden keine Daten", () => {
    const untyped = mod.track as (event: string, data?: unknown) => void;
    for (const name of ["unknown_event", "__proto__", "constructor"]) {
      expect(() => untyped(name, { x: 1 })).not.toThrow();
    }
    expect(umamiTrack).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 3; i++) expect(payloadOf(i).data).toEqual({});
  });

  it("EVENT_FIELDS deckt genau den dokumentierten Katalog ab (docs/betrieb/analytics.md)", () => {
    expect(mod.EVENT_FIELDS).toEqual({
      login_success: [],
      login_failed: ["reason"],
      therapy_session_saved: ["mode"],
      supervision_saved: ["mode", "kind"],
      patient_created: [],
      entry_deleted: ["entity"],
      action_failed: ["entity", "action", "category"],
      feedback_opened: [],
      feedback_saved: ["sentiment", "screenshot"],
      nachweis_printed: ["supervisor"],
      export_downloaded: ["entity"],
      account_deleted: [],
      quick_capture_used: ["source"],
      last_week_suggestions_applied: ["count"],
      dashboard_forecast_viewed: [],
    });
  });

  it("der Katalog enthält genau die dokumentierten Events", () => {
    expect(Object.values(mod.EVENTS).sort()).toEqual(
      [
        "account_deleted",
        "action_failed",
        "entry_deleted",
        "export_downloaded",
        "feedback_opened",
        "feedback_saved",
        "login_failed",
        "login_success",
        "nachweis_printed",
        "patient_created",
        "supervision_saved",
        "therapy_session_saved",
        "quick_capture_used",
        "last_week_suggestions_applied",
        "dashboard_forecast_viewed",
      ].sort()
    );
  });
});
