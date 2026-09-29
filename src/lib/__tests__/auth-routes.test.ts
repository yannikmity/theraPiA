// @vitest-environment node
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import type { Client } from "pg";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { hashToken } from "../tokens";
import type { RegistrationMode } from "../registration-policy";
import type { RateLimiter } from "../rate-limit";

const state = vi.hoisted(() => ({
  client: undefined as Client | undefined,
  mode: "invite" as RegistrationMode,
  allow: true,
  dbDown: false,
  setupToken: undefined as string | undefined,
}));

vi.mock("@/lib/db", () => ({
  query: (text: string, params?: unknown[]) => state.client!.query(text, params),
  db: { query: (text: string, params?: unknown[]) => state.client!.query(text, params) },
  // Wie withTransaction in db.ts, nur auf der Testverbindung; dbDown stellt einen Datenbankausfall nach.
  withTransaction: async <T,>(fn: (tx: Client) => Promise<T>): Promise<T> => {
    if (state.dbDown) throw new Error("connection refused");
    const client = state.client!;
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  },
}));
vi.mock("@/lib/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config")>()),
  getConfig: () => ({
    REGISTRATION_MODE: state.mode,
    NEXTAUTH_URL: "https://therapia.beispiel-institut.de",
    SETUP_TOKEN: state.setupToken,
  }),
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  const stub: RateLimiter = { check: () => state.allow, reset: () => undefined, size: () => 0 };
  return { ...actual, registerLimiter: stub, resetLimiter: stub };
});
// Kosten 4 statt 12 (#57): bcryptjs rechnet 12 Runden in ~0,3 s reinem JS – je Test mehrere Hashes, unter paralleler
// Last ein Grund für den 5-s-Timeout. Die Kosten stehen im Hash selbst, Vergleiche funktionieren unverändert; alle
// übrigen Tests hashen bereits mit 4.
vi.mock("../constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../constants")>()),
  BCRYPT_SALT_ROUNDS: 4,
}));

import { registerUser } from "../services/registration";
import { SETUP_BLOCKED_MESSAGE } from "../registration-policy";
import { createInvitation } from "../services/invitations";
import { createPasswordResetToken } from "../services/accounts";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as reset } from "@/app/api/auth/reset/route";

const PASSWORD = "sicheres-passwort";
const SETUP_TOKEN = "einrichtung-0123456789";

function post(path: string, body: unknown, raw = false): NextRequest {
  return new NextRequest(`http://localhost:3200${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.5" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  return (await state.client!.query(sql, params)).rows[0].n;
}

describe.skipIf(!TEST_DATABASE_URL)("Auth-Routen", () => {
  let cleanup: (() => Promise<void>) | undefined;
  let adminId = "";
  beforeEach(async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    state.client = t.client;
    state.mode = "invite";
    state.allow = true;
    state.dbDown = false;
    state.setupToken = SETUP_TOKEN;
    const admin = await registerUser(t.client, { email: "admin@example.com", password: PASSWORD, name: "Admin" }, "invite");
    if (!admin.ok || !admin.created) throw new Error("Setup: erster Account nicht angelegt");
    adminId = admin.userId;
  });
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
    state.client = undefined;
  });

  describe("POST /api/auth/register", () => {
    const body = { email: "pia@example.com", password: PASSWORD, name: "PiA" };

    it("antwortet 429, wenn der Limiter blockt, ohne die Datenbank anzufassen", async () => {
      state.allow = false;
      const res = await register(post("/api/auth/register", body));
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: "Zu viele Versuche. Bitte später erneut versuchen." });
      expect(await count("SELECT count(*)::int AS n FROM users")).toBe(1);
    });

    it.each([
      ["Array", "[]"],
      ["kaputtes JSON", "{"],
      ["null", "null"],
      ["Zahl", "5"],
    ])("antwortet 400 bei %s im Body", async (_label, raw) => {
      const res = await register(post("/api/auth/register", raw, true));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Ungültige Eingabe" });
    });

    it("antwortet 400 mit der ersten Schema-Meldung bei zu kurzem Passwort", async () => {
      const res = await register(post("/api/auth/register", { ...body, password: "kurz" }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Passwort muss mindestens 10 Zeichen lang sein" });
    });

    it("legt mit Einladungs-Token einen Account an und verbraucht die Einladung", async () => {
      const { token } = await createInvitation(state.client!, { email: null, role: "pia", createdBy: adminId });
      const res = await register(post("/api/auth/register", { ...body, invite: token }));
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ message: "Registrierung abgeschlossen" });
      const user = await state.client!.query("SELECT id, role FROM users WHERE email = 'pia@example.com'");
      expect(user.rows[0].role).toBe("pia");
      const used = await state.client!.query("SELECT used_by FROM invitations WHERE token_hash = $1", [hashToken(token)]);
      expect(used.rows[0].used_by).toBe(user.rows[0].id);
    });

    it("legt über eine Demo-Einladung einen Demo-Account mit Beispieldaten an", async () => {
      const { token } = await createInvitation(state.client!, { email: null, role: "pia", createdBy: adminId, withDemoData: true });
      const res = await register(post("/api/auth/register", { ...body, invite: token }));
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ message: "Registrierung abgeschlossen" });
      const user = await state.client!.query("SELECT id, is_demo FROM users WHERE email = 'pia@example.com'");
      expect(user.rows[0].is_demo).toBe(true);
      expect(await count("SELECT count(*)::int AS n FROM patients WHERE user_id = $1", [user.rows[0].id])).toBe(5);
    });

    it("übernimmt kein Demo-Kennzeichen aus dem Formular – es zählt nur die Einladung", async () => {
      const { token } = await createInvitation(state.client!, { email: null, role: "pia", createdBy: adminId });
      const res = await register(
        post("/api/auth/register", { ...body, invite: token, withDemoData: true, demo: true, is_demo: true })
      );
      expect(res.status).toBe(201);
      const user = await state.client!.query("SELECT id, is_demo FROM users WHERE email = 'pia@example.com'");
      expect(user.rows[0].is_demo).toBe(false);
      expect(await count("SELECT count(*)::int AS n FROM patients WHERE user_id = $1", [user.rows[0].id])).toBe(0);
    });

    it("antwortet im Modus invite ohne Token 400 mit dem Grund aus dem Service", async () => {
      const res = await register(post("/api/auth/register", body));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Registrierung nur mit Einladung möglich" });
    });

    it("antwortet im Modus open bei vergebener Adresse genau wie bei einer neuen (201, gleicher Text), legt aber nichts an", async () => {
      state.mode = "open";
      const fresh = await register(post("/api/auth/register", body));
      const taken = await register(post("/api/auth/register", { ...body, email: "admin@example.com" }));
      expect(fresh.status).toBe(201);
      expect(taken.status).toBe(201);
      expect(await taken.json()).toEqual(await fresh.json());
      expect(await count("SELECT count(*)::int AS n FROM users")).toBe(2);
    });

    it("antwortet mit Einladung bei vergebener Adresse genau wie bei einer neuen und verbraucht den Link", async () => {
      const fresh = await createInvitation(state.client!, { email: null, role: "pia", createdBy: adminId });
      const probe = await createInvitation(state.client!, { email: null, role: "pia", createdBy: adminId });
      const created = await register(post("/api/auth/register", { ...body, invite: fresh.token }));
      const taken = await register(post("/api/auth/register", { ...body, email: "admin@example.com", invite: probe.token }));
      expect(taken.status).toBe(created.status);
      expect(await taken.json()).toEqual(await created.json());
      // Kein Account angelegt oder geändert: nur der Admin und die echte Neuanmeldung.
      expect(await count("SELECT count(*)::int AS n FROM users")).toBe(2);
      const admin = await state.client!.query("SELECT password_hash FROM users WHERE email = 'admin@example.com'");
      expect(await bcrypt.compare(PASSWORD, admin.rows[0].password_hash)).toBe(true);
      // Der Link ist verbraucht (ohne Zuordnung) – ein zweiter Versuch scheitert wie bei jeder verbrauchten Einladung.
      const used = await state.client!.query("SELECT used_at, used_by FROM invitations WHERE token_hash = $1", [
        hashToken(probe.token),
      ]);
      expect(used.rows[0].used_at).not.toBeNull();
      expect(used.rows[0].used_by).toBeNull();
      const again = await register(post("/api/auth/register", { ...body, email: "neu@example.com", invite: probe.token }));
      expect(again.status).toBe(400);
      expect(await again.json()).toEqual({ error: "Einladung ungültig oder abgelaufen" });
    });

    describe("erster Account (Einrichtung)", () => {
      beforeEach(async () => {
        await state.client!.query("DELETE FROM users");
      });

      it("legt den ersten Account nur mit dem Einrichtungscode an, auch im Modus closed", async () => {
        state.mode = "closed";
        const without = await register(post("/api/auth/register", body));
        expect(without.status).toBe(400);
        expect(await without.json()).toEqual({ error: "Einrichtungscode fehlt oder ist falsch" });
        const wrong = await register(post("/api/auth/register", { ...body, setupToken: "falsch" }));
        expect(wrong.status).toBe(400);
        expect(await count("SELECT count(*)::int AS n FROM users")).toBe(0);

        const res = await register(post("/api/auth/register", { ...body, setupToken: SETUP_TOKEN }));
        expect(res.status).toBe(201);
        expect(await count("SELECT count(*)::int AS n FROM users WHERE role = 'admin'")).toBe(1);
      });

      it("sperrt die Einrichtung einer öffentlichen Instanz ohne SETUP_TOKEN", async () => {
        state.setupToken = undefined;
        const res = await register(post("/api/auth/register", { ...body, setupToken: "irgendwas" }));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: SETUP_BLOCKED_MESSAGE });
        expect(await count("SELECT count(*)::int AS n FROM users")).toBe(0);
      });
    });

    it("antwortet 500 ohne Details, wenn die Datenbank ausfällt", async () => {
      state.mode = "open";
      state.dbDown = true;
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const res = await register(post("/api/auth/register", body));
        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: "Ein Fehler ist aufgetreten" });
      } finally {
        error.mockRestore();
      }
    });
  });

  describe("POST /api/auth/reset", () => {
    it("antwortet 429, wenn der Limiter blockt", async () => {
      state.allow = false;
      const res = await reset(post("/api/auth/reset", { token: "x", password: PASSWORD }));
      expect(res.status).toBe(429);
    });

    it.each([
      ["Array", "[]"],
      ["kaputtes JSON", "{"],
    ])("antwortet 400 bei %s im Body", async (_label, raw) => {
      const res = await reset(post("/api/auth/reset", raw, true));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Ungültige Eingabe" });
    });

    it("antwortet 400 bei zu kurzem Passwort und bei unbekanntem Token", async () => {
      const short = await reset(post("/api/auth/reset", { token: "x", password: "kurz" }));
      expect(short.status).toBe(400);
      const unknown = await reset(post("/api/auth/reset", { token: "gibt-es-nicht", password: PASSWORD }));
      expect(unknown.status).toBe(400);
      expect(await unknown.json()).toEqual({ error: "Link ungültig oder abgelaufen" });
    });

    it("setzt das Passwort mit gültigem Token genau einmal zurück", async () => {
      const token = await createPasswordResetToken(state.client!, adminId);
      const first = await reset(post("/api/auth/reset", { token, password: "neues-passwort-123" }));
      expect(first.status).toBe(200);
      expect(await first.json()).toEqual({ message: "Passwort zurückgesetzt" });
      const row = (await state.client!.query("SELECT password_hash FROM users WHERE id = $1", [adminId])).rows[0];
      expect(await bcrypt.compare("neues-passwort-123", row.password_hash)).toBe(true);
      const second = await reset(post("/api/auth/reset", { token, password: "noch-ein-passwort" }));
      expect(second.status).toBe(400);
    });
  });
});
