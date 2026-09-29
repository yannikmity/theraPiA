import bcrypt from "bcryptjs";
import type { Db } from "../db";
import { generateToken, hashToken } from "../tokens";
import type { Role } from "../registration-policy";
import { BCRYPT_SALT_ROUNDS, RESET_TOKEN_TTL_MS } from "../constants";
import { passwordCheckLimiter, type RateLimiter } from "../rate-limit";
import { checkPasswordThrottled, PASSWORD_CHECK_LIMITED_MESSAGE } from "./password-check";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
  disabled: boolean;
  demo: boolean;
}

export async function listUsers(db: Db): Promise<AdminUser[]> {
  const { rows } = await db.query(
    "SELECT id, email, name, role, created_at, disabled_at, is_demo FROM users ORDER BY created_at ASC"
  );
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name ?? "",
    role: r.role,
    createdAt: new Date(r.created_at).toISOString(),
    disabled: r.disabled_at !== null,
    demo: r.is_demo === true,
  }));
}

export const LAST_ADMIN_MESSAGE =
  "Der letzte aktive Admin-Account kann nicht gesperrt werden. Vorher eine zweite Person als Admin einladen.";

export type SetUserDisabledResult = { ok: true } | { ok: false; reason: string };

// Sperrt die Zeilen aller aktiven Admins (FOR UPDATE) und meldet, ob userId der einzige ist. Nur in einer
// Transaktion sinnvoll (withTransaction): Postgres prüft die WHERE-Klausel nach dem Warten erneut, gleichzeitige
// Sperrungen oder Löschungen laufen dadurch nacheinander – sonst könnten sich zwei Admins gegenseitig
// sperren und die Instanz bliebe ohne Admin. „Aktiver Admin“ = role 'admin' und nicht gesperrt.
export async function isLastActiveAdmin(db: Db, userId: string): Promise<boolean> {
  const { rows } = await db.query(
    "SELECT id FROM users WHERE role = 'admin' AND disabled_at IS NULL ORDER BY id FOR UPDATE"
  );
  return rows.length === 1 && rows[0].id === userId;
}

// Sperren in einer Transaktion aufrufen (siehe isLastActiveAdmin). Entsperren ist immer erlaubt.
export async function setUserDisabled(db: Db, userId: string, disabled: boolean): Promise<SetUserDisabledResult> {
  if (disabled && (await isLastActiveAdmin(db, userId))) {
    return { ok: false, reason: LAST_ADMIN_MESSAGE };
  }
  await db.query(
    `UPDATE users
     SET disabled_at = CASE WHEN $2 THEN now() ELSE NULL END,
         session_version = session_version + 1,
         updated_at = now()
     WHERE id = $1`,
    [userId, disabled]
  );
  return { ok: true };
}

export async function createPasswordResetToken(db: Db, userId: string, now: Date = new Date()): Promise<string> {
  const { token, hash } = generateToken();
  await db.query("INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
    hash,
    userId,
    new Date(now.getTime() + RESET_TOKEN_TTL_MS),
  ]);
  return token;
}

export async function resetPassword(db: Db, token: string, newPassword: string, now: Date = new Date()): Promise<boolean> {
  const { rows } = await db.query(
    `UPDATE password_reset_tokens SET used_at = $1
     WHERE token_hash = $2 AND used_at IS NULL AND expires_at > $1
     RETURNING user_id`,
    [now, hashToken(token)]
  );
  if (rows.length === 0) return false;
  const userId: string = rows[0].user_id;
  // Alle anderen offenen Reset-Links des Accounts entwerten.
  await db.query("UPDATE password_reset_tokens SET used_at = $1 WHERE user_id = $2 AND used_at IS NULL", [
    now,
    userId,
  ]);
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
  await db.query(
    "UPDATE users SET password_hash = $1, session_version = session_version + 1, updated_at = now() WHERE id = $2",
    [passwordHash, userId]
  );
  return true;
}

export const CHANGE_PASSWORD_WRONG_MESSAGE = "Aktuelles Passwort ist falsch";

export type ChangePasswordResult = { ok: true } | { ok: false; code: "wrong" | "limited"; reason: string };

// Passwort ändern für angemeldete Personen: aktuelles Passwort gedrosselt prüfen (password-check.ts), dann neuen
// Hash schreiben und alle Sitzungen entwerten (session_version). Ein Account ohne Zeile wird wie ein falsches
// Passwort behandelt – eine gültige Sitzung ohne users-Zeile gibt es nicht (jwt-Callback).
export async function changePassword(
  db: Db,
  userId: string,
  currentPassword: string,
  newPassword: string,
  limiter: RateLimiter = passwordCheckLimiter
): Promise<ChangePasswordResult> {
  const check = await checkPasswordThrottled(db, limiter, userId, currentPassword);
  if (!check.ok) {
    return check.code === "limited"
      ? { ok: false, code: "limited", reason: PASSWORD_CHECK_LIMITED_MESSAGE }
      : { ok: false, code: "wrong", reason: CHANGE_PASSWORD_WRONG_MESSAGE };
  }
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
  await db.query(
    "UPDATE users SET password_hash = $1, session_version = session_version + 1, updated_at = now() WHERE id = $2",
    [passwordHash, userId]
  );
  return { ok: true };
}
