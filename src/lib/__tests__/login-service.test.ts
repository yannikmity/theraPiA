// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import bcrypt from "bcryptjs";
import type { Db } from "../db";
import { createRateLimiter, createLoginThrottle } from "../rate-limit";
import { attemptLogin } from "../services/login";

const PASSWORD = "richtig-langes-passwort";
// Kosten 4 statt 12: nur für die Testgeschwindigkeit, bcrypt.compare liest die Kosten aus dem Hash.
const userRow = {
  id: "u1",
  email: "pia@example.com",
  name: "Test",
  password_hash: bcrypt.hashSync(PASSWORD, 4),
  role: "pia",
  session_version: 0,
  is_demo: false,
};

function fakeDb(rows: Record<string, unknown>[]): Db {
  return { query: async () => ({ rows }) } as unknown as Db;
}

function throttle(perClient = 10, perEmail = 20) {
  return createLoginThrottle(
    createRateLimiter({ limit: perClient, windowMs: 1000, now: () => 0 }),
    createRateLimiter({ limit: perEmail, windowMs: 1000, now: () => 0 })
  );
}

const input = { email: " PIA@example.com ", password: PASSWORD, clientIp: "203.0.113.5" };

describe("attemptLogin", () => {
  it("meldet den Account bei richtigen Zugangsdaten an (Adresse normalisiert)", async () => {
    expect(await attemptLogin(fakeDb([userRow]), throttle(), input)).toEqual({
      ok: true,
      user: { id: "u1", email: "pia@example.com", name: "Test", role: "pia", sessionVersion: 0, demo: false },
    });
  });

  it("meldet falsches Passwort und unbekannte Adresse mit demselben Code", async () => {
    expect(await attemptLogin(fakeDb([userRow]), throttle(), { ...input, password: "falsch" })).toEqual({
      ok: false,
      code: "credentials",
    });
    expect(await attemptLogin(fakeDb([]), throttle(), input)).toEqual({ ok: false, code: "credentials" });
  });

  it("weist leere Eingaben ab, ohne die Datenbank zu fragen", async () => {
    const query = vi.fn();
    const db = { query } as unknown as Db;
    expect(await attemptLogin(db, throttle(), { ...input, password: "" })).toEqual({ ok: false, code: "credentials" });
    expect(await attemptLogin(db, throttle(), { ...input, email: "  " })).toEqual({ ok: false, code: "credentials" });
    expect(query).not.toHaveBeenCalled();
  });

  it("meldet das Limit mit eigenem Code und prüft dann kein Passwort mehr", async () => {
    const db = fakeDb([userRow]);
    const t = throttle(1, 20);
    await attemptLogin(db, t, { ...input, password: "falsch" });
    const query = vi.spyOn(db, "query");
    expect(await attemptLogin(db, t, input)).toEqual({ ok: false, code: "rate_limited" });
    expect(query).not.toHaveBeenCalled();
  });

  it("gibt die Zähler nach erfolgreicher Anmeldung frei", async () => {
    const t = throttle(2, 20);
    await attemptLogin(fakeDb([userRow]), t, { ...input, password: "falsch" });
    expect((await attemptLogin(fakeDb([userRow]), t, input)).ok).toBe(true);
    // ohne Reset wäre dies der dritte Versuch und geblockt
    expect((await attemptLogin(fakeDb([userRow]), t, input)).ok).toBe(true);
  });

  it("meldet einen Datenbankfehler als 'unavailable' statt zu werfen", async () => {
    const db = {
      query: async () => {
        throw new Error("connection refused");
      },
    } as unknown as Db;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await attemptLogin(db, throttle(), input)).toEqual({ ok: false, code: "unavailable" });
      expect(error).toHaveBeenCalledOnce();
    } finally {
      error.mockRestore();
    }
  });
});
