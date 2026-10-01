// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import pg from "pg";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { hashToken } from "../tokens";
import { registerUser } from "../services/registration";
import {
  createInvitation,
  listOpenInvitations,
  purgeExpiredInvitationEmails,
  revokeInvitation,
} from "../services/invitations";
import { INVITATION_TTL_MS, RESET_TOKEN_TTL_MS, SELF_RESET_TOKEN_TTL_MS } from "../constants";
import {
  listUsers,
  setUserDisabled,
  createPasswordResetToken,
  resetPassword,
  requestPasswordReset,
  LAST_ADMIN_MESSAGE,
} from "../services/accounts";
import { loadAdminOverview } from "../services/admin-overview";

// Kosten 4 statt 12 (#57): bcryptjs rechnet 12 Runden in ~0,3 s reinem JS – je Test mehrere Hashes, unter paralleler
// Last ein Grund für den 5-s-Timeout. Die Kosten stehen im Hash selbst, Vergleiche funktionieren unverändert; alle
// übrigen Tests hashen bereits mit 4.
vi.mock("../constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../constants")>()),
  BCRYPT_SALT_ROUNDS: 4,
}));

const PASSWORD = "sicheres-passwort";

describe.skipIf(!TEST_DATABASE_URL)("Konto-Services", () => {
  let cleanup: (() => Promise<void>) | undefined;
  const extraClients: pg.Client[] = [];
  afterEach(async () => {
    while (extraClients.length > 0) await extraClients.pop()!.end();
    await cleanup?.();
    cleanup = undefined;
  });

  async function setup() {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const admin = await registerUser(t.client, { email: "Admin@Example.com ", password: PASSWORD, name: "Admin", setup: "ok" }, "invite");
    if (!admin.ok || !admin.created) throw new Error("Setup: erster Account nicht angelegt");
    return { db: t.client, adminId: admin.userId, adminRole: admin.role };
  }

  // Zweite Verbindung auf dasselbe Test-Schema, um parallele Registrierungen zu simulieren.
  async function secondClient(db: pg.Client): Promise<pg.Client> {
    const { rows } = await db.query("SHOW search_path");
    const other = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await other.connect();
    extraClients.push(other);
    await other.query(`SET search_path TO ${rows[0].search_path}`);
    return other;
  }

  async function registerInTransaction(client: pg.Client, email: string, token: string) {
    await client.query("BEGIN");
    try {
      const r = await registerUser(client, { email, password: PASSWORD, name: "PiA", inviteToken: token }, "invite");
      await client.query(r.ok ? "COMMIT" : "ROLLBACK");
      return r;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  async function usersFromInvitation(db: pg.Client, token: string) {
    const { rows } = await db.query(
      "SELECT used_by FROM invitations WHERE used_by IS NOT NULL AND token_hash = $1",
      [hashToken(token)]
    );
    return rows;
  }

  async function registerPia(db: pg.Client, adminId: string, email: string): Promise<string> {
    const { token } = await createInvitation(db, { email: null, role: "pia", createdBy: adminId });
    const r = await registerUser(db, { email, password: PASSWORD, name: "PiA", inviteToken: token }, "invite");
    if (!r.ok || !r.created) throw new Error("Registrierung fehlgeschlagen");
    return r.userId;
  }

  async function promoteToAdmin(db: pg.Client, userId: string) {
    await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [userId]);
  }

  it("macht den ersten Account zum Admin und speichert die E-Mail normalisiert", async () => {
    const { db, adminRole } = await setup();
    expect(adminRole).toBe("admin");
    const users = await listUsers(db);
    expect(users.map((u) => u.email)).toEqual(["admin@example.com"]);
  });

  it("lässt ohne Einladung niemanden mehr rein", async () => {
    const { db } = await setup();
    const r = await registerUser(db, { email: "pia@example.com", password: PASSWORD, name: "PiA", setup: "ok" }, "invite");
    expect(r).toEqual({ ok: false, reason: "Registrierung nur mit Einladung möglich" });
  });

  it("registriert mit Einladung genau einmal", async () => {
    const { db, adminId } = await setup();
    const { token } = await createInvitation(db, { email: null, role: "pia", createdBy: adminId });
    expect(await listOpenInvitations(db)).toHaveLength(1);

    const r = await registerUser(db, { email: "pia@example.com", password: PASSWORD, name: "PiA", inviteToken: token }, "invite");
    expect(r).toMatchObject({ ok: true, role: "pia" });
    expect(await listOpenInvitations(db)).toHaveLength(0);

    const again = await registerUser(db, { email: "pia2@example.com", password: PASSWORD, name: "PiA 2", inviteToken: token }, "invite");
    expect(again).toEqual({ ok: false, reason: "Einladung ungültig oder abgelaufen" });
  });

  it("verbraucht eine Einladung bei zwei parallelen Transaktionen nur einmal", async () => {
    const { db, adminId } = await setup();
    const other = await secondClient(db);
    const { token } = await createInvitation(db, { email: null, role: "pia", createdBy: adminId });

    const results = await Promise.allSettled([
      registerInTransaction(db, "pia1@example.com", token),
      registerInTransaction(other, "pia2@example.com", token),
    ]);
    const succeeded = results.filter((r) => r.status === "fulfilled" && r.value.ok);
    expect(succeeded).toHaveLength(1);

    const users = await listUsers(db);
    expect(users.filter((u) => u.role === "pia")).toHaveLength(1);
  });

  it("verbraucht eine Einladung auch ohne Transaktion nicht doppelt", async () => {
    const { db, adminId } = await setup();
    const other = await secondClient(db);
    const { token } = await createInvitation(db, { email: null, role: "pia", createdBy: adminId });

    // Ohne Transaktion greift die Advisory-Sperre nicht; beide lesen die Einladung, bevor
    // eine sie verbraucht (bcrypt liegt dazwischen). Der bewachte UPDATE muss die zweite abweisen.
    const results = await Promise.allSettled([
      registerUser(db, { email: "pia1@example.com", password: PASSWORD, name: "PiA", inviteToken: token }, "invite"),
      registerUser(other, { email: "pia2@example.com", password: PASSWORD, name: "PiA", inviteToken: token }, "invite"),
    ]);
    const succeeded = results.filter((r) => r.status === "fulfilled" && r.value.ok);
    expect(succeeded).toHaveLength(1);
    const winner = (succeeded[0] as PromiseFulfilledResult<{ ok: true; userId: string }>).value.userId;

    const used = await usersFromInvitation(db, token);
    expect(used).toEqual([{ used_by: winner }]);
  });

  it("akzeptiert keine abgelaufene oder widerrufene Einladung", async () => {
    const { db, adminId } = await setup();
    const old = await createInvitation(db, { email: null, role: "pia", createdBy: adminId }, new Date("2020-01-01"));
    const r1 = await registerUser(db, { email: "a@example.com", password: PASSWORD, name: "A", inviteToken: old.token }, "invite");
    expect(r1.ok).toBe(false);

    const fresh = await createInvitation(db, { email: null, role: "pia", createdBy: adminId });
    const [open] = await listOpenInvitations(db);
    await revokeInvitation(db, open.id);
    const r2 = await registerUser(db, { email: "b@example.com", password: PASSWORD, name: "B", inviteToken: fresh.token }, "invite");
    expect(r2.ok).toBe(false);
  });

  it("antwortet im Modus open bei vergebener Adresse wie bei einem Erfolg, legt aber nichts an", async () => {
    const { db } = await setup();
    const r = await registerUser(db, { email: "admin@example.com", password: PASSWORD, name: "X", setup: "ok" }, "open");
    expect(r).toEqual({ ok: true, created: false });
    expect(await listUsers(db)).toHaveLength(1);
  });

  it("legt im Modus open eine neue Adresse als pia an (created: true)", async () => {
    const { db } = await setup();
    const r = await registerUser(db, { email: "neu@example.com", password: PASSWORD, name: "Neu", setup: "ok" }, "open");
    expect(r).toMatchObject({ ok: true, created: true, role: "pia" });
    expect((await listUsers(db)).map((u) => u.email)).toEqual(["admin@example.com", "neu@example.com"]);
  });

  it("antwortet mit Einladung bei vergebener Adresse wie bei einem Erfolg und verbraucht die Einladung", async () => {
    const { db, adminId } = await setup();
    const { token } = await createInvitation(db, { email: null, role: "pia", createdBy: adminId });
    const r = await registerUser(
      db,
      { email: "admin@example.com", password: PASSWORD, name: "X", inviteToken: token },
      "invite"
    );
    expect(r).toEqual({ ok: true, created: false });
    expect(await listUsers(db)).toHaveLength(1);
    // Einladung verbraucht, aber niemandem zugeordnet – von außen nicht von einer Registrierung zu unterscheiden.
    expect(await listOpenInvitations(db)).toHaveLength(0);
    const used = await db.query("SELECT used_at, used_by FROM invitations WHERE token_hash = $1", [hashToken(token)]);
    expect(used.rows[0].used_at).not.toBeNull();
    expect(used.rows[0].used_by).toBeNull();
    // Der Link ist damit weg: ein zweiter Versuch mit neuer Adresse scheitert wie bei jeder verbrauchten Einladung.
    const again = await registerUser(db, { email: "pia@example.com", password: PASSWORD, name: "PiA", inviteToken: token }, "invite");
    expect(again).toEqual({ ok: false, reason: "Einladung ungültig oder abgelaufen" });
  });

  it("verbraucht auch eine an die vergebene Adresse gebundene Einladung und antwortet wie bei Erfolg", async () => {
    const { db, adminId } = await setup();
    const { token } = await createInvitation(db, { email: "admin@example.com", role: "admin", createdBy: adminId });
    const r = await registerUser(db, { email: "Admin@example.com", password: PASSWORD, name: "X", inviteToken: token }, "invite");
    expect(r).toEqual({ ok: true, created: false });
    expect(await listOpenInvitations(db)).toHaveLength(0);
    const used = await db.query("SELECT used_by FROM invitations WHERE token_hash = $1", [hashToken(token)]);
    expect(used.rows[0].used_by).toBeNull();
    expect((await listUsers(db))[0].role).toBe("admin"); // unverändert – nichts wurde angelegt oder geändert
  });

  it("setzt ein Passwort per Reset-Link genau einmal zurück und beendet alte Sitzungen", async () => {
    const { db, adminId } = await setup();
    const token = await createPasswordResetToken(db, adminId);
    const olderLink = await createPasswordResetToken(db, adminId);

    expect(await resetPassword(db, token, "neues-passwort-123")).toBe(true);
    expect(await resetPassword(db, token, "noch-ein-passwort")).toBe(false);
    // Nach erfolgreichem Reset sind alle anderen offenen Links des Accounts ungültig.
    expect(await resetPassword(db, olderLink, "noch-ein-passwort")).toBe(false);

    const row = (await db.query("SELECT password_hash, session_version FROM users WHERE id = $1", [adminId])).rows[0];
    expect(await bcrypt.compare("neues-passwort-123", row.password_hash)).toBe(true);
    expect(row.session_version).toBe(1);
  });

  describe("requestPasswordReset", () => {
    const NOW = new Date("2026-10-01T10:00:00Z");

    async function tokens(db: pg.Client, userId: string) {
      return (
        await db.query(
          "SELECT token_hash, expires_at, used_at FROM password_reset_tokens WHERE user_id = $1 ORDER BY created_at",
          [userId]
        )
      ).rows;
    }

    it("liefert für ein aktives Konto einen Link, 1 Stunde gültig, auch bei abweichender Schreibweise", async () => {
      const { db, adminId } = await setup();
      const userId = await registerPia(db, adminId, "pia@example.com");
      const result = await requestPasswordReset(db, "  PiA@Example.com ", NOW);
      expect(result?.email).toBe("pia@example.com");
      const rows = await tokens(db, userId);
      expect(rows).toHaveLength(1);
      expect(rows[0].token_hash).toBe(hashToken(result!.token));
      expect(new Date(rows[0].expires_at).getTime()).toBe(NOW.getTime() + SELF_RESET_TOKEN_TTL_MS);
    });

    it("liefert null für unbekannte Adressen, gesperrte Konten und Konten ohne Passwort", async () => {
      const { db, adminId } = await setup();
      expect(await requestPasswordReset(db, "niemand@example.com", NOW)).toBeNull();
      const userId = await registerPia(db, adminId, "pia@example.com");
      await db.query("UPDATE users SET disabled_at = now() WHERE id = $1", [userId]);
      expect(await requestPasswordReset(db, "pia@example.com", NOW)).toBeNull();
      await db.query("UPDATE users SET password_hash = NULL WHERE id = $1", [adminId]);
      expect(await requestPasswordReset(db, "admin@example.com", NOW)).toBeNull();
      expect((await db.query("SELECT count(*)::int AS n FROM password_reset_tokens")).rows[0].n).toBe(0);
    });

    it("entwertet ältere offene Links, nur der jüngste gilt", async () => {
      const { db, adminId } = await setup();
      await registerPia(db, adminId, "pia@example.com");
      const first = await requestPasswordReset(db, "pia@example.com", NOW);
      const second = await requestPasswordReset(db, "pia@example.com", new Date(NOW.getTime() + 60_000));
      expect(await resetPassword(db, first!.token, "neues-passwort-123", new Date(NOW.getTime() + 120_000))).toBe(false);
      expect(await resetPassword(db, second!.token, "neues-passwort-123", new Date(NOW.getTime() + 120_000))).toBe(true);
    });

    it("lässt den Admin-Link bei 24 Stunden", async () => {
      const { db, adminId } = await setup();
      const userId = await registerPia(db, adminId, "pia@example.com");
      await createPasswordResetToken(db, userId, NOW);
      const [row] = await tokens(db, userId);
      expect(new Date(row.expires_at).getTime()).toBe(NOW.getTime() + RESET_TOKEN_TTL_MS);
    });
  });

  it("sperrt einen Account und erhöht die Session-Version", async () => {
    const { db, adminId } = await setup();
    const piaId = await registerPia(db, adminId, "pia@example.com");
    expect(await setUserDisabled(db, piaId, true)).toEqual({ ok: true });
    expect((await listUsers(db)).find((u) => u.id === piaId)?.disabled).toBe(true);
    const row = (await db.query("SELECT session_version FROM users WHERE id = $1", [piaId])).rows[0];
    expect(row.session_version).toBe(1);
  });

  it("sperrt den letzten aktiven Admin nicht", async () => {
    const { db, adminId } = await setup();
    expect(await setUserDisabled(db, adminId, true)).toEqual({ ok: false, reason: LAST_ADMIN_MESSAGE });
    expect((await listUsers(db))[0].disabled).toBe(false);
  });

  it("sperrt einen Admin, solange ein anderer aktiv bleibt, und entsperrt immer", async () => {
    const { db, adminId } = await setup();
    const secondId = await registerPia(db, adminId, "zweite@example.com");
    await promoteToAdmin(db, secondId);
    expect(await setUserDisabled(db, adminId, true)).toEqual({ ok: true });
    // jetzt ist secondId der letzte aktive Admin
    expect(await setUserDisabled(db, secondId, true)).toEqual({ ok: false, reason: LAST_ADMIN_MESSAGE });
    expect(await setUserDisabled(db, adminId, false)).toEqual({ ok: true });
    expect(await setUserDisabled(db, secondId, true)).toEqual({ ok: true });
  });

  it("lässt zwei Admins sich nicht gleichzeitig gegenseitig sperren", async () => {
    const { db, adminId } = await setup();
    const other = await secondClient(db);
    const secondId = await registerPia(db, adminId, "zweite@example.com");
    await promoteToAdmin(db, secondId);
    const otherPid: number = (await other.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;

    // Transaktion A sperrt secondId und hält ihre Zeilensperren bis zum COMMIT.
    await db.query("BEGIN");
    expect(await setUserDisabled(db, secondId, true)).toEqual({ ok: true });

    // Transaktion B will gleichzeitig adminId sperren. Mit FOR UPDATE muss sie auf A warten;
    // ohne würde sie die noch aktive secondId sehen und sofort durchlaufen.
    await other.query("BEGIN");
    let settled = false;
    const pending = setUserDisabled(other, adminId, true).finally(() => {
      settled = true;
    });
    let sawLock = false;
    for (let i = 0; i < 200 && !settled; i++) {
      const { rows } = await db.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1", [otherPid]);
      if (rows[0]?.wait_event_type === "Lock") {
        sawLock = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    // Die Schleife darf nicht still auslaufen: B wartet sichtbar auf die Sperre oder ist schon fertig.
    expect(settled || sawLock).toBe(true);
    await db.query("COMMIT");

    const result = await pending;
    await other.query(result.ok ? "COMMIT" : "ROLLBACK");
    expect(result).toEqual({ ok: false, reason: LAST_ADMIN_MESSAGE });
    const active = await db.query("SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND disabled_at IS NULL");
    expect(active.rows[0].n).toBe(1);
  });

  it("entsperrt einen Account: disabled_at leer, Session-Version steigt erneut", async () => {
    const { db, adminId } = await setup();
    const piaId = await registerPia(db, adminId, "pia@example.com");
    expect(await setUserDisabled(db, piaId, true)).toEqual({ ok: true });
    expect(await setUserDisabled(db, piaId, false)).toEqual({ ok: true });
    expect((await listUsers(db)).find((u) => u.id === piaId)?.disabled).toBe(false);
    const row = (await db.query("SELECT disabled_at, session_version FROM users WHERE id = $1", [piaId])).rows[0];
    expect(row).toEqual({ disabled_at: null, session_version: 2 });
  });

  it("weist eine an eine andere Adresse gebundene Einladung zurück und lässt sie offen", async () => {
    const { db, adminId } = await setup();
    const { token } = await createInvitation(db, { email: "eingeladen@example.com", role: "pia", createdBy: adminId });
    const wrong = await registerUser(db, { email: "andere@example.com", password: PASSWORD, name: "X", inviteToken: token }, "invite");
    expect(wrong).toEqual({ ok: false, reason: "Diese Einladung gilt für eine andere E-Mail-Adresse" });
    expect(await listOpenInvitations(db)).toHaveLength(1);
    expect(await listUsers(db)).toHaveLength(1);
    // Die gebundene Adresse selbst, unabhängig von Groß-/Kleinschreibung, kommt durch.
    const right = await registerUser(db, { email: "Eingeladen@Example.com", password: PASSWORD, name: "PiA", inviteToken: token }, "invite");
    expect(right).toMatchObject({ ok: true, created: true, role: "pia" });
    expect(await listOpenInvitations(db)).toHaveLength(0);
  });

  it("liefert die Admin-Übersicht mit Nutzer:innen und offenen Einladungen", async () => {
    const { db, adminId } = await setup();
    await createInvitation(db, { email: null, role: "pia", createdBy: adminId });
    const overview = await loadAdminOverview(db);
    expect(overview.users.map((u) => u.email)).toEqual(["admin@example.com"]);
    expect(overview.invitations).toHaveLength(1);
  });

  it("entfernt die Adresse nicht eingelöster Einladungen 30 Tage nach Ablauf – jüngere und eingelöste bleiben", async () => {
    const { db, adminId } = await setup();
    const now = new Date("2026-06-01T00:00:00Z");
    const day = 24 * 60 * 60 * 1000;
    const createdAt = (daysAgo: number) => new Date(now.getTime() - INVITATION_TTL_MS - daysAgo * day);
    await createInvitation(db, { email: "alt@example.com", role: "pia", createdBy: adminId }, createdAt(31));
    await createInvitation(db, { email: "frisch@example.com", role: "pia", createdBy: adminId }, createdAt(10));
    await createInvitation(db, { email: null, role: "pia", createdBy: adminId }, createdAt(40));
    const used = await createInvitation(db, { email: "eingeloest@example.com", role: "pia", createdBy: adminId }, createdAt(40));
    await db.query("UPDATE invitations SET used_at = $2, used_by = $3 WHERE token_hash = $1", [hashToken(used.token), now, adminId]);

    expect(await purgeExpiredInvitationEmails(db, now)).toBe(1);
    const { rows } = await db.query("SELECT email FROM invitations ORDER BY created_at");
    // Einfügereihenfolge: alt (bereinigt), frisch, ohne Adresse, eingelöst (bleibt)
    expect(rows.map((r) => r.email)).toEqual([null, "frisch@example.com", null, "eingeloest@example.com"]);
    expect(await purgeExpiredInvitationEmails(db, now)).toBe(0);
  });

  it("räumt beim Laden der Admin-Übersicht auf", async () => {
    const { db, adminId } = await setup();
    const now = new Date("2026-06-01T00:00:00Z");
    await createInvitation(db, { email: "alt@example.com", role: "pia", createdBy: adminId }, new Date("2026-01-01T00:00:00Z"));
    await loadAdminOverview(db, now);
    const { rows } = await db.query("SELECT email FROM invitations");
    expect(rows).toEqual([{ email: null }]);
  });

  it("merkt sich „mit Beispieldaten“ an der Einladung und zeigt es in der Liste offener Einladungen", async () => {
    const { db, adminId } = await setup();
    await createInvitation(db, { email: null, role: "pia", createdBy: adminId, withDemoData: true });
    await createInvitation(db, { email: "neu@example.com", role: "pia", createdBy: adminId });
    const offen = await listOpenInvitations(db);
    expect(offen).toHaveLength(2);
    expect(offen.find((i) => i.email === null)?.withDemoData).toBe(true);
    expect(offen.find((i) => i.email === "neu@example.com")?.withDemoData).toBe(false);
  });

  it("speichert „mit Beispieldaten“ nur für PiA-Einladungen, auch wenn der Aufruf es für Admins verlangt", async () => {
    const { db, adminId } = await setup();
    await createInvitation(db, { email: "admin2@example.com", role: "admin", createdBy: adminId, withDemoData: true });
    const { rows } = await db.query("SELECT role, with_demo_data FROM invitations");
    expect(rows).toEqual([{ role: "admin", with_demo_data: false }]);
  });

  it("kennzeichnet Demo-Accounts in der Account-Liste", async () => {
    const { db } = await setup();
    await db.query("INSERT INTO users (email, name, is_demo) VALUES ('demo@example.com', 'PiA Demo', true)");
    expect((await listUsers(db)).map((u) => [u.email, u.demo])).toEqual([
      ["admin@example.com", false],
      ["demo@example.com", true],
    ]);
  });
});
