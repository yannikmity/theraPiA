// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import pg from "pg";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture, countRows } from "./helpers/fixtures";
import { createInvitation } from "../services/invitations";
import { registerUser } from "../services/registration";
import { changePassword, createPasswordResetToken } from "../services/accounts";
import { createRateLimiter, passwordCheckLimiter } from "../rate-limit";
import { PASSWORD_CHECK_LIMIT } from "../constants";
import { PASSWORD_CHECK_LIMITED_MESSAGE } from "../services/password-check";
import { refreshToken } from "../services/session";
import {
  deleteOwnAccount,
  DELETE_ACCOUNT_LAST_ADMIN_MESSAGE,
  DELETE_ACCOUNT_WRONG_PASSWORD_MESSAGE,
} from "../services/account-deletion";

// Kosten 4 statt 12 (#57): bcryptjs rechnet 12 Runden in ~0,3 s reinem JS – je Test mehrere Hashes, unter paralleler
// Last ein Grund für den 5-s-Timeout. Die Kosten stehen im Hash selbst, Vergleiche funktionieren unverändert; alle
// übrigen Tests hashen bereits mit 4.
vi.mock("../constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../constants")>()),
  BCRYPT_SALT_ROUNDS: 4,
}));

const PASSWORD = "sicheres-passwort";

// Alle Tabellen mit user_id (Migration 003, ON DELETE CASCADE) – je Account vor und nach dem Löschen gezählt.
const USER_TABLES = [
  "patients",
  "supervisors",
  "therapy_sessions",
  "supervision_sessions",
  "groups",
  "group_sessions",
  "financial_settings",
  "password_reset_tokens",
];

describe.skipIf(!TEST_DATABASE_URL)("Eigenen Account löschen", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    while (extraClients.length > 0) await extraClients.pop()!.end();
    await cleanup?.();
    cleanup = undefined;
  });

  // Zusatzverbindungen VOR cleanup schließen (DROP SCHEMA wartet sonst auf sie).
  const extraClients: pg.Client[] = [];

  // Zweite Verbindung auf dasselbe Test-Schema, damit zwei Transaktionen wirklich parallel laufen.
  async function secondClient(db: pg.Client): Promise<pg.Client> {
    const { rows } = await db.query("SELECT current_schema() AS schema");
    const other = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await other.connect();
    extraClients.push(other);
    await other.query(`SET search_path TO ${rows[0].schema}`);
    return other;
  }

  async function setup() {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    // Kosten 4 statt 12: nur für die Testgeschwindigkeit, bcrypt.compare liest die Kosten aus dem Hash.
    const hash = await bcrypt.hash(PASSWORD, 4);
    await t.client.query("UPDATE users SET password_hash = $1", [hash]);
    await t.client.query("INSERT INTO financial_settings (user_id, income_per_hour) VALUES ($1, 40), ($2, 50)", [
      f.a.userId,
      f.b.userId,
    ]);
    await createPasswordResetToken(t.client, f.a.userId);
    // Die gemeinsame Fixture hat keine Doppelstunden-Verknüpfung – je Account eine anlegen, damit sie mitgezählt wird.
    for (const x of [f.a, f.b]) {
      await t.client.query(
        "INSERT INTO supervision_group_session_links (supervision_id, group_session_id) VALUES ($1, $2)",
        [x.supervisionId, x.groupSessionId]
      );
    }
    return { db: t.client, f };
  }

  // Nur für Tests: Tabellen und Bedingungen sind Konstanten aus dem Testcode.
  async function countsFor(db: pg.Client, userId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const table of USER_TABLES) counts[table] = await countRows(db, table, "WHERE user_id = $1", [userId]);
    counts.supervision_therapy_links = await countRows(
      db,
      "supervision_therapy_links stl JOIN supervision_sessions ss ON ss.id = stl.supervision_id",
      "WHERE ss.user_id = $1",
      [userId]
    );
    counts.supervision_group_session_links = await countRows(
      db,
      "supervision_group_session_links sgl JOIN supervision_sessions ss ON ss.id = sgl.supervision_id",
      "WHERE ss.user_id = $1",
      [userId]
    );
    return counts;
  }

  it("lehnt ein falsches Passwort ab und löscht nichts", async () => {
    const { db, f } = await setup();
    expect(await deleteOwnAccount(db, f.a.userId, "falsch")).toEqual({
      ok: false,
      reason: DELETE_ACCOUNT_WRONG_PASSWORD_MESSAGE,
    });
    expect(await countRows(db, "users")).toBe(2);
    expect(await countRows(db, "patients", "WHERE user_id = $1", [f.a.userId])).toBe(1);
  });

  it("drosselt die Passwortprüfung: nach dem Limit wird auch das richtige Passwort abgelehnt", async () => {
    const { db, f } = await setup();
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => 0 });
    await deleteOwnAccount(db, f.a.userId, "falsch", limiter);
    await deleteOwnAccount(db, f.a.userId, "falsch", limiter);
    expect(await deleteOwnAccount(db, f.a.userId, PASSWORD, limiter)).toEqual({
      ok: false,
      reason: PASSWORD_CHECK_LIMITED_MESSAGE,
    });
    expect(await countRows(db, "users")).toBe(2);
    // Account B hat einen eigenen Zähler
    expect(await deleteOwnAccount(db, f.b.userId, PASSWORD, limiter)).toEqual({ ok: true });
  });

  it("teilt den Zähler des Moduls mit „Passwort ändern“: nach 5 Fehlversuchen dort ist auch das Löschen gesperrt", async () => {
    const { db, f } = await setup();
    expect(PASSWORD_CHECK_LIMIT).toBe(5);
    try {
      for (let i = 0; i < PASSWORD_CHECK_LIMIT; i++) {
        expect(await changePassword(db, f.a.userId, "falsch", "neues-passwort-123")).toMatchObject({ code: "wrong" });
      }
      expect(await deleteOwnAccount(db, f.a.userId, PASSWORD)).toEqual({
        ok: false,
        reason: PASSWORD_CHECK_LIMITED_MESSAGE,
      });
      expect(await countRows(db, "users", "WHERE id = $1", [f.a.userId])).toBe(1);
      // Schlüssel ist die Nutzer-ID: Account B ist nicht betroffen.
      expect(await deleteOwnAccount(db, f.b.userId, PASSWORD)).toEqual({ ok: true });
    } finally {
      passwordCheckLimiter.reset(f.a.userId);
    }
  });

  it("löscht den Account mit allen Fachdaten – jede Tabelle danach leer, Account B unverändert", async () => {
    const { db, f } = await setup();
    const beforeA = await countsFor(db, f.a.userId);
    const beforeB = await countsFor(db, f.b.userId);
    expect(Object.values(beforeA).every((n) => n >= 1)).toBe(true);

    expect(await deleteOwnAccount(db, f.a.userId, PASSWORD)).toEqual({ ok: true });

    expect(await countRows(db, "users", "WHERE id = $1", [f.a.userId])).toBe(0);
    expect(await countsFor(db, f.a.userId)).toEqual(Object.fromEntries(Object.keys(beforeA).map((t) => [t, 0])));
    expect(await countsFor(db, f.b.userId)).toEqual(beforeB);
  });

  it("lässt Einladungen ohne Personenbezug stehen (created_by und used_by werden NULL)", async () => {
    const { db, f } = await setup();
    await createInvitation(db, { email: null, role: "pia", createdBy: f.a.userId });
    await db.query("UPDATE invitations SET used_at = now(), used_by = $1 WHERE created_by = $1", [f.a.userId]);

    expect(await deleteOwnAccount(db, f.a.userId, PASSWORD)).toEqual({ ok: true });

    const { rows } = await db.query("SELECT created_by, used_by FROM invitations");
    expect(rows).toEqual([{ created_by: null, used_by: null }]);
  });

  it("entfernt die E-Mail-Adresse aus Einladungen, die die Person eingelöst hat – fremde bleiben unverändert", async () => {
    const { db, f } = await setup();
    await createInvitation(db, { email: "a@example.com", role: "pia", createdBy: f.b.userId });
    await createInvitation(db, { email: "b@example.com", role: "pia", createdBy: f.a.userId });
    await db.query("UPDATE invitations SET used_at = now(), used_by = $1 WHERE email = 'a@example.com'", [f.a.userId]);
    await db.query("UPDATE invitations SET used_at = now(), used_by = $1 WHERE email = 'b@example.com'", [f.b.userId]);

    expect(await deleteOwnAccount(db, f.a.userId, PASSWORD)).toEqual({ ok: true });

    const { rows } = await db.query("SELECT email, used_by FROM invitations ORDER BY created_by NULLS FIRST");
    expect(rows).toEqual([
      { email: "b@example.com", used_by: f.b.userId },
      { email: null, used_by: null },
    ]);
  });

  it("entfernt die E-Mail-Adresse aus offenen Einladungen an die Person – offene an andere bleiben", async () => {
    const { db, f } = await setup();
    await createInvitation(db, { email: "A@Example.com", role: "pia", createdBy: f.b.userId });
    await createInvitation(db, { email: "c@example.com", role: "pia", createdBy: f.b.userId });

    expect(await deleteOwnAccount(db, f.a.userId, PASSWORD)).toEqual({ ok: true });

    const { rows } = await db.query("SELECT email, used_at FROM invitations ORDER BY email NULLS FIRST");
    expect(rows).toEqual([
      { email: null, used_at: null },
      { email: "c@example.com", used_at: null },
    ]);
  });

  it("entfernt die E-Mail-Adresse aus Einladungen an die Person, die über die schon vergebene Adresse verbraucht wurden", async () => {
    const { db, f } = await setup();
    const toA = await createInvitation(db, { email: "a@example.com", role: "pia", createdBy: f.b.userId });
    const toB = await createInvitation(db, { email: "b@example.com", role: "pia", createdBy: f.a.userId });
    // Beide Adressen sind vergeben: registerUser verbraucht die Einladungen ohne Zuordnung (used_by NULL).
    for (const [email, token] of [["A@example.com", toA.token], ["b@example.com", toB.token]]) {
      expect(await registerUser(db, { email, password: PASSWORD, name: "X", inviteToken: token }, "invite")).toEqual({
        ok: true,
        created: false,
      });
    }

    expect(await deleteOwnAccount(db, f.a.userId, PASSWORD)).toEqual({ ok: true });

    const { rows } = await db.query(
      "SELECT email, used_by, used_at IS NOT NULL AS used FROM invitations ORDER BY email NULLS FIRST"
    );
    expect(rows).toEqual([
      { email: null, used_by: null, used: true },
      { email: "b@example.com", used_by: null, used: true },
    ]);
  });

  it("verweigert dem letzten aktiven Admin die Löschung", async () => {
    const { db, f } = await setup();
    await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [f.a.userId]);
    expect(await deleteOwnAccount(db, f.a.userId, PASSWORD)).toEqual({
      ok: false,
      reason: DELETE_ACCOUNT_LAST_ADMIN_MESSAGE,
    });
    expect(await countRows(db, "users")).toBe(2);
  });

  it("lässt einen Admin gehen, solange ein anderer Admin aktiv bleibt", async () => {
    const { db, f } = await setup();
    await db.query("UPDATE users SET role = 'admin'");
    expect(await deleteOwnAccount(db, f.a.userId, PASSWORD)).toEqual({ ok: true });
    // B ist jetzt der letzte aktive Admin
    expect(await deleteOwnAccount(db, f.b.userId, PASSWORD)).toEqual({
      ok: false,
      reason: DELETE_ACCOUNT_LAST_ADMIN_MESSAGE,
    });
    expect(await countRows(db, "users")).toBe(1);
  });

  it("macht bestehende Sitzungen ungültig: refreshToken liefert danach null", async () => {
    const { db, f } = await setup();
    expect(await refreshToken(db, { id: f.a.userId, role: "pia", sv: 0 })).toEqual({ id: f.a.userId, role: "pia", sv: 0, demo: false });

    await deleteOwnAccount(db, f.a.userId, PASSWORD);

    expect(await refreshToken(db, { id: f.a.userId, role: "pia", sv: 0 })).toBeNull();
  });

  it("lässt zwei Admins sich nicht gleichzeitig löschen – der zweite wartet und wird abgelehnt", async () => {
    const { db, f } = await setup();
    await db.query("UPDATE users SET role = 'admin'");
    const other = await secondClient(db);
    const otherPid: number = (await other.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;

    // Transaktion A löscht Account A und hält die FOR-UPDATE-Sperren der aktiven Admins bis zum COMMIT.
    await db.query("BEGIN");
    expect(await deleteOwnAccount(db, f.a.userId, PASSWORD)).toEqual({ ok: true });

    // Transaktion B will gleichzeitig Account B löschen und muss auf A warten.
    await other.query("BEGIN");
    let settled = false;
    const pending = deleteOwnAccount(other, f.b.userId, PASSWORD).finally(() => {
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
    expect(settled || sawLock).toBe(true);
    await db.query("COMMIT");

    const result = await pending;
    await other.query(result.ok ? "COMMIT" : "ROLLBACK");
    expect(result).toEqual({ ok: false, reason: DELETE_ACCOUNT_LAST_ADMIN_MESSAGE });
    expect(await countRows(db, "users")).toBe(1);
  });
});
