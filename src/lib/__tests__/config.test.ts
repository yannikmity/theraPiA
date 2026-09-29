import { describe, it, expect } from "vitest";
import { parseConfig } from "../config";

const valid = { DATABASE_URL: "postgresql://u:p@localhost/db", NEXTAUTH_SECRET: "x".repeat(32) };

describe("parseConfig", () => {
  it("setzt Defaults", () => {
    expect(parseConfig(valid)).toEqual({
      ...valid,
      NEXTAUTH_URL: "http://localhost:3010",
      REGISTRATION_MODE: "invite",
      FEEDBACK_DIR: "./data/feedback",
    });
  });

  it("behandelt leere Werte wie nicht gesetzte und nutzt die Defaults", () => {
    expect(parseConfig({ ...valid, REGISTRATION_MODE: "", NEXTAUTH_URL: "", FEEDBACK_DIR: "" })).toEqual({
      ...valid,
      NEXTAUTH_URL: "http://localhost:3010",
      REGISTRATION_MODE: "invite",
      FEEDBACK_DIR: "./data/feedback",
    });
  });

  it("meldet ein leeres Secret als fehlend", () => {
    expect(() => parseConfig({ ...valid, NEXTAUTH_SECRET: "" })).toThrow("NEXTAUTH_SECRET: fehlt");
  });

  it("lehnt ein zu kurzes Secret mit verständlicher Meldung ab", () => {
    expect(() => parseConfig({ ...valid, NEXTAUTH_SECRET: "kurz" })).toThrow("NEXTAUTH_SECRET");
  });

  it("lehnt einen unbekannten Registrierungsmodus ab", () => {
    expect(() => parseConfig({ ...valid, REGISTRATION_MODE: "alle" })).toThrow("REGISTRATION_MODE");
  });
});

describe("parseConfig in Produktion", () => {
  const prod = { ...valid, NODE_ENV: "production" };

  it("verlangt NEXTAUTH_URL", () => {
    expect(() => parseConfig(prod)).toThrow("NEXTAUTH_URL");
    expect(() => parseConfig({ ...prod, NEXTAUTH_URL: "" })).toThrow("NEXTAUTH_URL");
  });

  it("verlangt https", () => {
    expect(() => parseConfig({ ...prod, NEXTAUTH_URL: "http://therapia.example.net" })).toThrow("https://");
  });

  it.each(["https://therapia.example.org", "https://therapia.example.com"])("lehnt den Platzhalter %s ab", (url) => {
    expect(() => parseConfig({ ...prod, NEXTAUTH_URL: url })).toThrow("NEXTAUTH_URL");
  });

  it.each(["http://localhost:3000", "http://127.0.0.1:3000"])("akzeptiert Loopback-http %s", (url) => {
    expect(parseConfig({ ...prod, NEXTAUTH_URL: url }).NEXTAUTH_URL).toBe(url);
  });

  it("lehnt http auf einer LAN-Adresse ab", () => {
    expect(() => parseConfig({ ...prod, NEXTAUTH_URL: "http://192.168.1.10:3000" })).toThrow("https://");
  });

  it("prüft den Platzhalter per Hostname und akzeptiert counterexample.org", () => {
    expect(parseConfig({ ...prod, NEXTAUTH_URL: "https://counterexample.org" }).NEXTAUTH_URL).toBe(
      "https://counterexample.org"
    );
  });

  it("legt Feedback in Produktion unter /data/feedback ab, außer FEEDBACK_DIR ist gesetzt", () => {
    const ok = { ...prod, NEXTAUTH_URL: "https://therapia.example.net" };
    expect(parseConfig(ok).FEEDBACK_DIR).toBe("/data/feedback");
    expect(parseConfig({ ...ok, FEEDBACK_DIR: "/srv/feedback" }).FEEDBACK_DIR).toBe("/srv/feedback");
  });

  it("akzeptiert eine echte https-Adresse", () => {
    expect(parseConfig({ ...prod, NEXTAUTH_URL: "https://therapia.example.net" }).NEXTAUTH_URL).toBe(
      "https://therapia.example.net"
    );
  });
});

describe("parseConfig – Umami", () => {
  const url = "https://analytics.example.net/script.js";
  const id = "11111111-1111-4111-8111-111111111111";

  it("übernimmt Script-URL und Website-ID gemeinsam", () => {
    expect(parseConfig({ ...valid, UMAMI_SCRIPT_URL: url, UMAMI_WEBSITE_ID: id })).toMatchObject({
      UMAMI_SCRIPT_URL: url,
      UMAMI_WEBSITE_ID: id,
    });
  });

  it("lässt beide weg, wenn sie leer sind (kein Tracking)", () => {
    const config = parseConfig({ ...valid, UMAMI_SCRIPT_URL: "", UMAMI_WEBSITE_ID: "" });
    expect(config.UMAMI_SCRIPT_URL).toBeUndefined();
    expect(config.UMAMI_WEBSITE_ID).toBeUndefined();
  });

  it("lehnt einen einzelnen Wert ab", () => {
    expect(() => parseConfig({ ...valid, UMAMI_SCRIPT_URL: url })).toThrow("nur gemeinsam");
    expect(() => parseConfig({ ...valid, UMAMI_WEBSITE_ID: id })).toThrow("nur gemeinsam");
  });

  it("lehnt eine ungültige URL und eine Website-ID ohne UUID-Form ab", () => {
    expect(() => parseConfig({ ...valid, UMAMI_SCRIPT_URL: "analytics.example.net", UMAMI_WEBSITE_ID: id })).toThrow("UMAMI_SCRIPT_URL");
    expect(() => parseConfig({ ...valid, UMAMI_SCRIPT_URL: url, UMAMI_WEBSITE_ID: "abc" })).toThrow("UMAMI_WEBSITE_ID");
  });

  it("lehnt Nicht-http(s)-Schemata ab (sonst stünde „null“ in der CSP)", () => {
    for (const bad of ["javascript:alert(1)", "data:text/javascript,1", "ftp://analytics.example.net/script.js"]) {
      expect(() => parseConfig({ ...valid, UMAMI_SCRIPT_URL: bad, UMAMI_WEBSITE_ID: id })).toThrow("UMAMI_SCRIPT_URL");
    }
    expect(parseConfig({ ...valid, UMAMI_SCRIPT_URL: "http://localhost:3999/script.js", UMAMI_WEBSITE_ID: id }).UMAMI_SCRIPT_URL).toBe(
      "http://localhost:3999/script.js"
    );
  });

  it("verlangt in Produktion https", () => {
    const prod = { ...valid, NODE_ENV: "production", NEXTAUTH_URL: "https://therapia.example.net" };
    expect(() =>
      parseConfig({ ...prod, UMAMI_SCRIPT_URL: "http://analytics.example.net/script.js", UMAMI_WEBSITE_ID: id })
    ).toThrow("UMAMI_SCRIPT_URL: muss mit https:// beginnen");
    expect(parseConfig({ ...prod, UMAMI_SCRIPT_URL: url, UMAMI_WEBSITE_ID: id }).UMAMI_SCRIPT_URL).toBe(url);
  });
});

describe("NEXTAUTH_SECRET: öffentlich bekannte Beispielwerte", () => {
  const prod = { ...valid, NODE_ENV: "production", NEXTAUTH_URL: "https://therapia.beispiel-institut.de" };
  const screenshotSecret = "screenshots-nur-lokal-0123456789abcdefghijklmnop";

  it("lehnt das Secret der Screenshot-Harness auf einer öffentlichen Instanz ab", () => {
    expect(() => parseConfig({ ...prod, NEXTAUTH_SECRET: screenshotSecret })).toThrow("öffentlich bekannt");
  });

  it("lehnt Platzhalter wie „change-this“ oder „changeme“ ab", () => {
    expect(() =>
      parseConfig({ ...prod, NEXTAUTH_SECRET: "your-secret-key-change-this-in-production-min-32-chars" })
    ).toThrow("NEXTAUTH_SECRET");
    expect(() => parseConfig({ ...prod, NEXTAUTH_SECRET: `changeme-${"x".repeat(32)}` })).toThrow("NEXTAUTH_SECRET");
  });

  it("erlaubt bekannte Werte nur auf einer lokalen Instanz (Screenshot-Harness mit --prod)", () => {
    const local = { ...prod, NEXTAUTH_URL: "http://localhost:3100", NEXTAUTH_SECRET: screenshotSecret };
    expect(parseConfig(local).NEXTAUTH_SECRET).toBe(screenshotSecret);
  });
});

describe("SETUP_TOKEN", () => {
  it("ist optional und wird übernommen", () => {
    expect(parseConfig(valid).SETUP_TOKEN).toBeUndefined();
    expect(parseConfig({ ...valid, SETUP_TOKEN: "einrichtung-0123456789" }).SETUP_TOKEN).toBe("einrichtung-0123456789");
  });

  it("verlangt mindestens 16 Zeichen", () => {
    expect(() => parseConfig({ ...valid, SETUP_TOKEN: "kurz" })).toThrow("SETUP_TOKEN");
  });
});

