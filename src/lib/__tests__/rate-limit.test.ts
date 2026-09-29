import { describe, it, expect } from "vitest";
import { createRateLimiter, createLoginThrottle, clientIp } from "../rate-limit";

describe("createRateLimiter", () => {
  it("blockt nach dem Limit und gibt nach Ablauf des Fensters wieder frei", () => {
    let t = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
    expect(limiter.check("k")).toBe(true);
    expect(limiter.check("k")).toBe(true);
    expect(limiter.check("k")).toBe(false);
    expect(limiter.check("anderer")).toBe(true);
    t = 1000;
    expect(limiter.check("k")).toBe(true);
  });

  it("setzt einen Schlüssel zurück", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    limiter.check("k");
    limiter.reset("k");
    expect(limiter.check("k")).toBe(true);
  });

  it("räumt abgelaufene Schlüssel auf, sobald mehr als 10.000 Einträge liegen", () => {
    let t = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t });
    for (let i = 0; i < 10_001; i++) limiter.check(`k${i}`);
    expect(limiter.size()).toBe(10_001);
    t = 999;
    limiter.check("frisch"); // 10.002 Einträge, noch nichts abgelaufen
    t = 1000;
    expect(limiter.check("weitere")).toBe(true); // löst den Sweep aus: alle k0…k10000 sind abgelaufen
    expect(limiter.size()).toBe(2); // "frisch" (999 < 1000+1000) und "weitere"
    expect(limiter.check("frisch")).toBe(false); // der Sweep hat den frischen Eintrag nicht angetastet
  });

  it("räumt unterhalb der Schwelle nicht auf – abgelaufene Einträge bleiben bis zum nächsten Zugriff", () => {
    let t = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t });
    limiter.check("alt");
    t = 5000;
    limiter.check("neu");
    expect(limiter.size()).toBe(2);
  });
});

describe("clientIp", () => {
  it("nimmt die erste Adresse aus X-Forwarded-For", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
  });

  it("fällt auf unknown zurück", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("nimmt X-Real-IP, wenn X-Forwarded-For fehlt oder leer ist", () => {
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-forwarded-for": " , 10.0.0.1", "x-real-ip": "203.0.113.8" }))).toBe("203.0.113.8");
  });

  it("bevorzugt X-Forwarded-For vor X-Real-IP", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5", "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.5");
  });
});

describe("createLoginThrottle", () => {
  function throttle(perClient: number, perEmail: number) {
    return createLoginThrottle(
      createRateLimiter({ limit: perClient, windowMs: 1000, now: () => 0 }),
      createRateLimiter({ limit: perEmail, windowMs: 1000, now: () => 0 })
    );
  }

  it("begrenzt Versuche pro Client und Adresse", () => {
    const t = throttle(2, 100);
    expect(t.allow("203.0.113.5", "pia@example.com")).toBe(true);
    expect(t.allow("203.0.113.5", "pia@example.com")).toBe(true);
    expect(t.allow("203.0.113.5", "pia@example.com")).toBe(false);
    // andere Adresse vom selben Client und derselbe Account von einem anderen Client bleiben frei
    expect(t.allow("203.0.113.5", "andere@example.com")).toBe(true);
    expect(t.allow("203.0.113.6", "pia@example.com")).toBe(true);
  });

  it("begrenzt Versuche pro Adresse über alle Clients hinweg", () => {
    const t = throttle(100, 3);
    expect(t.allow("203.0.113.1", "pia@example.com")).toBe(true);
    expect(t.allow("203.0.113.2", "pia@example.com")).toBe(true);
    expect(t.allow("203.0.113.3", "pia@example.com")).toBe(true);
    expect(t.allow("203.0.113.4", "pia@example.com")).toBe(false);
    expect(t.allow("203.0.113.4", "andere@example.com")).toBe(true);
  });

  it("bewegt bei jedem Versuch beide Zähler, auch wenn der erste schon blockt", () => {
    const t = throttle(1, 2);
    t.allow("203.0.113.5", "pia@example.com"); // Client 1/1, Adresse 1/2
    expect(t.allow("203.0.113.5", "pia@example.com")).toBe(false); // Client blockt, Adresse 2/2
    expect(t.allow("203.0.113.6", "pia@example.com")).toBe(false); // Adresse voll
  });

  it("setzt nach erfolgreicher Anmeldung beide Zähler zurück", () => {
    const t = throttle(1, 1);
    t.allow("203.0.113.5", "pia@example.com");
    t.reset("203.0.113.5", "pia@example.com");
    expect(t.allow("203.0.113.5", "pia@example.com")).toBe(true);
  });
});
