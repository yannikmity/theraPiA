import bcrypt from "bcryptjs";
import type { Db } from "../db";
import { hashToken } from "../tokens";
import { decideRegistration, type RegistrationMode, type Role } from "../registration-policy";
import { BCRYPT_SALT_ROUNDS } from "../constants";
import { todayIso } from "../dates";
import { generateDemoData } from "../demo/demo-daten.mjs";
import { insertDemoData } from "../demo/demo-daten-db.mjs";

export interface RegisterUserInput {
  email: string;
  password: string;
  name: string;
  inviteToken?: string | null;
}

export type RegisterUserResult =
  | { ok: true; created: true; userId: string; role: Role; demo: boolean }
  // Adresse schon vergeben (Modus open oder mit gültiger Einladung): nach außen nicht von einem Erfolg zu
  // unterscheiden, sonst ließe sich abfragen, wer auf dieser Instanz einen Account hat. Eine Einladung wird
  // dabei verbraucht – ein Link darf kein Werkzeug sein, um beliebig viele Adressen durchzuprobieren.
  | { ok: true; created: false }
  | { ok: false; reason: string };

export async function countUsers(db: Db): Promise<number> {
  const { rows } = await db.query("SELECT count(*)::int AS n FROM users");
  return rows[0].n;
}

// Aufrufer müssen registerUser in withTransaction ausführen. Die Advisory-Sperre serialisiert die
// Anlage des ersten Admins (sie gilt nur innerhalb einer Transaktion). Einladungen schützt zusätzlich
// der bewachte UPDATE: wird eine Einladung parallel schon verbraucht, wirft registerUser, und
// withTransaction rollt die Nutzeranlage zurück. Auch die Beispieldaten eines Demo-Accounts hängen an
// dieser Transaktion.
const REGISTRATION_LOCK_ID = 7274202;
export async function registerUser(
  db: Db,
  input: RegisterUserInput,
  mode: RegistrationMode,
  now: Date = new Date()
): Promise<RegisterUserResult> {
  await db.query("SELECT pg_advisory_xact_lock($1)", [REGISTRATION_LOCK_ID]);
  const email = input.email.trim().toLowerCase();
  const userCount = await countUsers(db);

  let invitation: { id: string; role: Role; email: string | null; with_demo_data: boolean } | null = null;
  if (input.inviteToken) {
    const { rows } = await db.query(
      "SELECT id, role, email, with_demo_data FROM invitations WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2 FOR UPDATE",
      [hashToken(input.inviteToken), now]
    );
    invitation = rows[0] ?? null;
    if (!invitation) return { ok: false, reason: "Einladung ungültig oder abgelaufen" };
  }

  const decision = decideRegistration({ mode, userCount, invitation, email });
  if (!decision.allowed) return { ok: false, reason: decision.reason };

  // Hash vor der Existenzprüfung: die Antwort dauert bei vergebener Adresse genauso lang wie bei
  // einer neuen (kein Zeit-Seitenkanal auf die Existenz eines Accounts).
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);
  const existing = await db.query("SELECT 1 FROM users WHERE email = $1", [email]);
  if (existing.rows.length > 0) {
    if (invitation) await consumeInvitation(db, invitation.id, null, now);
    return { ok: true, created: false };
  }

  // Demo-Account (#9): das Kennzeichen kommt nur aus der Einladung (nie aus dem Formular) und gilt nur für PiA – ein
  // Demo-Admin sähe die echten Accounts der Instanz. Die Beispieldaten entstehen in derselben Transaktion, relativ
  // zum heutigen Berliner Kalendertag; scheitert das Einfügen, gibt es weder Account noch verbrauchte Einladung.
  const demo = invitation?.with_demo_data === true && decision.role === "pia";
  const { rows } = await db.query(
    "INSERT INTO users (email, password_hash, name, role, is_demo) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [email, passwordHash, input.name.trim(), decision.role, demo]
  );
  const userId: string = rows[0].id;
  if (demo) await insertDemoData(db, userId, generateDemoData(todayIso(now)));

  if (invitation) await consumeInvitation(db, invitation.id, userId, now);
  return { ok: true, created: true, userId, role: decision.role, demo };
}

// Bewachter UPDATE: wurde die Einladung parallel schon verbraucht, wirft dies und withTransaction rollt zurück.
// usedBy null = verbraucht ohne neuen Account (vergebene Adresse).
async function consumeInvitation(db: Db, invitationId: string, usedBy: string | null, now: Date): Promise<void> {
  const consumed = await db.query(
    "UPDATE invitations SET used_at = $1, used_by = $2 WHERE id = $3 AND used_at IS NULL",
    [now, usedBy, invitationId]
  );
  if (consumed.rowCount !== 1) throw new Error("Einladung wurde bereits verwendet");
}
