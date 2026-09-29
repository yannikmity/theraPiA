import type { Db } from "../db";
import type { RateLimiter } from "../rate-limit";
import { PASSWORD_CHECK_WINDOW_MINUTES } from "../constants";
import { verifyPassword } from "./session";

export const PASSWORD_CHECK_LIMITED_MESSAGE = `Zu viele Versuche. Bitte in ${PASSWORD_CHECK_WINDOW_MINUTES} Minuten erneut versuchen.`;

export type PasswordCheck = { ok: true } | { ok: false; code: "wrong" | "limited" };

// Erneute Passworteingabe für Aktionen angemeldeter Personen (Passwort ändern, Account löschen). Jeder Versuch im
// Zeitfenster zählt; das richtige Passwort setzt den Zähler zurück. Blockt der Limiter, wird kein
// Passwort mehr verglichen (kein bcrypt für Angreifer:innen).
export async function checkPasswordThrottled(
  db: Db,
  limiter: RateLimiter,
  userId: string,
  password: string
): Promise<PasswordCheck> {
  if (!limiter.check(userId)) return { ok: false, code: "limited" };
  if (!(await verifyPassword(db, userId, password))) return { ok: false, code: "wrong" };
  limiter.reset(userId);
  return { ok: true };
}
