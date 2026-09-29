// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import type { Client } from "pg";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { countRows } from "./helpers/fixtures";
import { hashToken } from "../tokens";
import type { Db } from "../db";
import { registerUser } from "../services/registration";
import { createInvitation } from "../services/invitations";

const PASSWORD = "sicheres-passwort";
const NOW = new Date("2026-09-28T10:00:00Z");

describe.skipIf(!TEST_DATABASE_URL)("Registrierung über eine Demo-Einladung", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  async function setup() {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const admin = await registerUser(t.client, { email: "admin@example.com", password: PASSWORD, name: "Admin" }, "invite", NOW);
    if (!admin.ok || !admin.created) throw new Error("Setup: erster Account nicht angelegt");
    return { db: t.client, adminId: admin.userId };
  }

  // Wie withTransaction in db.ts, auf der Testverbindung; `tx` darf eine Hülle um dieselbe Verbindung sein.
  async function inTransaktion<T>(db: Client, fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    try {
      const result = await fn();
      await db.query("COMMIT");
      return result;
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  }

  async function einladung(db: Client, adminId: string, withDemoData: boolean, role: "pia" | "admin" = "pia") {
    return (await createInvitation(db, { email: null, role, createdBy: adminId, withDemoData }, NOW)).token;
  }

  it("legt einen Demo-Account mit Beispieldaten bis zum Registrierungstag an und verbraucht die Einladung", async () => {
    const { db, adminId } = await setup();
    const token = await einladung(db, adminId, true);

    const r = await registerUser(db, { email: "demo@example.com", password: PASSWORD, name: "PiA Demo", inviteToken: token }, "invite", NOW);

    expect(r).toEqual({ ok: true, created: true, userId: expect.any(String), role: "pia", demo: true });
    if (!r.ok || !r.created) throw new Error("nicht angelegt");
    const user = await db.query("SELECT is_demo FROM users WHERE id = $1", [r.userId]);
    expect(user.rows[0].is_demo).toBe(true);
    expect(await countRows(db, "patients", "WHERE user_id = $1", [r.userId])).toBe(5);
    expect(await countRows(db, "therapy_sessions", "WHERE user_id = $1", [r.userId])).toBe(159);
    expect(await countRows(db, "supervision_sessions", "WHERE user_id = $1", [r.userId])).toBe(39);
    expect(await countRows(db, "group_sessions", "WHERE user_id = $1", [r.userId])).toBe(32);
    expect(await countRows(db, "financial_settings", "WHERE user_id = $1", [r.userId])).toBe(1);
    const letzte = await db.query("SELECT max(date) AS d FROM therapy_sessions WHERE user_id = $1", [r.userId]);
    expect(letzte.rows[0].d).toBe("2026-09-27");
    const used = await db.query("SELECT used_by FROM invitations WHERE token_hash = $1", [hashToken(token)]);
    expect(used.rows[0].used_by).toBe(r.userId);
    expect(await countRows(db, "patients", "WHERE user_id = $1", [adminId])).toBe(0);
  });

  it("rechnet vom Berliner Kalendertag aus – kurz nach Mitternacht zählt schon der neue Tag", async () => {
    const { db, adminId } = await setup();
    const token = await einladung(db, adminId, true);
    const nachMitternacht = new Date("2026-09-28T22:30:00Z"); // 29.09. 00:30 in Berlin
    const r = await registerUser(db, { email: "demo@example.com", password: PASSWORD, name: "PiA Demo", inviteToken: token }, "invite", nachMitternacht);
    if (!r.ok || !r.created) throw new Error("nicht angelegt");
    const letzte = await db.query("SELECT max(date) AS d FROM therapy_sessions WHERE user_id = $1", [r.userId]);
    expect(letzte.rows[0].d).toBe("2026-09-28");
  });

  it("legt über eine normale Einladung einen normalen Account ohne Daten an", async () => {
    const { db, adminId } = await setup();
    const token = await einladung(db, adminId, false);
    const r = await registerUser(db, { email: "pia@example.com", password: PASSWORD, name: "PiA", inviteToken: token }, "invite", NOW);
    expect(r).toMatchObject({ ok: true, created: true, role: "pia", demo: false });
    if (!r.ok || !r.created) throw new Error("nicht angelegt");
    expect((await db.query("SELECT is_demo FROM users WHERE id = $1", [r.userId])).rows[0].is_demo).toBe(false);
    expect(await countRows(db, "patients", "WHERE user_id = $1", [r.userId])).toBe(0);
  });

  it("füllt bei vergebener Adresse keinen bestehenden Account – die Einladung ist trotzdem verbraucht", async () => {
    const { db, adminId } = await setup();
    const token = await einladung(db, adminId, true);
    const r = await registerUser(db, { email: "admin@example.com", password: PASSWORD, name: "X", inviteToken: token }, "invite", NOW);
    expect(r).toEqual({ ok: true, created: false });
    expect(await countRows(db, "patients")).toBe(0);
    const used = await db.query("SELECT used_at IS NOT NULL AS used FROM invitations WHERE token_hash = $1", [hashToken(token)]);
    expect(used.rows[0].used).toBe(true);
  });

  it("ignoriert das Kennzeichen an einer Einladung für die Administration (nur per SQL setzbar)", async () => {
    const { db, adminId } = await setup();
    const token = await einladung(db, adminId, false, "admin");
    await db.query("UPDATE invitations SET with_demo_data = true WHERE token_hash = $1", [hashToken(token)]);
    const r = await registerUser(db, { email: "zweit@example.com", password: PASSWORD, name: "Admin 2", inviteToken: token }, "invite", NOW);
    expect(r).toMatchObject({ ok: true, created: true, role: "admin", demo: false });
    expect(await countRows(db, "patients")).toBe(0);
  });

  it("rollt bei einem Fehler beim Einfügen alles zurück: kein Account, Einladung weiter gültig", async () => {
    const { db, adminId } = await setup();
    const token = await einladung(db, adminId, true);
    const fehlerhaft: Db = {
      query: (text: string, params?: unknown[]) =>
        text.includes("INSERT INTO therapy_sessions") ? Promise.reject(new Error("Testfehler")) : db.query(text, params),
    };

    await expect(
      inTransaktion(db, () =>
        registerUser(fehlerhaft, { email: "demo@example.com", password: PASSWORD, name: "PiA Demo", inviteToken: token }, "invite", NOW)
      )
    ).rejects.toThrow("Testfehler");

    expect(await countRows(db, "users")).toBe(1);
    expect(await countRows(db, "patients")).toBe(0);
    const offen = await db.query("SELECT used_at FROM invitations WHERE token_hash = $1", [hashToken(token)]);
    expect(offen.rows[0].used_at).toBeNull();
  });
});
