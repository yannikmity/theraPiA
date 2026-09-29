import type { Db } from "../db";
import { passwordCheckLimiter, type RateLimiter } from "../rate-limit";
import { isLastActiveAdmin } from "./accounts";
import { checkPasswordThrottled, PASSWORD_CHECK_LIMITED_MESSAGE } from "./password-check";

export const DELETE_ACCOUNT_WRONG_PASSWORD_MESSAGE = "Das Passwort ist falsch.";
export const DELETE_ACCOUNT_LAST_ADMIN_MESSAGE =
  "Der letzte aktive Admin-Account kann nicht gelöscht werden. Vorher eine zweite Person als Admin einladen.";

export type DeleteOwnAccountResult = { ok: true } | { ok: false; reason: string };

// Löscht den eigenen Account (Art. 17 DSGVO). In withTransaction aufrufen – die Admin-Prüfung sperrt Zeilen.
// Reihenfolge: erst Passwort (gedrosselt pro Account, bcrypt ohne gehaltene Sperren), dann Admin-Prüfung (gleiche Sperrreihenfolge
// wie setUserDisabled), dann die E-Mail der Person aus Einladungen entfernen (von ihr eingelöste und alle an ihre
// Adresse – offene wie verbrauchte, auch ohne Zuordnung verbrauchte bei schon vergebener Adresse, siehe registerUser;
// eine gebundene Einladung kann nur diese Adresse verbrauchen; Vergleich mit lower(), beide Seiten speichert die App
// ohnehin kleingeschrieben), dann DELETE. Die Fremdschlüssel aus Migration 003 löschen alle Fachdaten mit (CASCADE); von der Person erzeugte oder eingelöste
// Einladungen bleiben ohne Personenbezug stehen (SET NULL). Die E-Mail einer erzeugten Einladung gehört der
// eingeladenen Person, bleibt also.
// Danach ist jede Sitzung ungültig: refreshToken findet keine users-Zeile mehr und liefert null.
export async function deleteOwnAccount(
  db: Db,
  userId: string,
  password: string,
  limiter: RateLimiter = passwordCheckLimiter
): Promise<DeleteOwnAccountResult> {
  const check = await checkPasswordThrottled(db, limiter, userId, password);
  if (!check.ok) {
    return {
      ok: false,
      reason: check.code === "limited" ? PASSWORD_CHECK_LIMITED_MESSAGE : DELETE_ACCOUNT_WRONG_PASSWORD_MESSAGE,
    };
  }
  if (await isLastActiveAdmin(db, userId)) {
    return { ok: false, reason: DELETE_ACCOUNT_LAST_ADMIN_MESSAGE };
  }
  await db.query(
    `UPDATE invitations SET email = NULL
     WHERE used_by = $1 OR lower(email) = (SELECT lower(email) FROM users WHERE id = $1)`,
    [userId]
  );
  await db.query("DELETE FROM users WHERE id = $1", [userId]);
  return { ok: true };
}
