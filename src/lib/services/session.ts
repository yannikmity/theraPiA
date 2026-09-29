import bcrypt from "bcryptjs";
import type { Db } from "../db";
import type { Role } from "../registration-policy";

// Vergleich gegen einen festen Hash, wenn es den Account nicht gibt – gleiche Antwortzeit wie bei falschem Passwort.
const DUMMY_HASH = "$2b$12$VDir8BM9o8YSHDU0HP31y.rlaJU.r32NqhRagpyY41T3/114iEElC";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  sessionVersion: number;
  // Demo-Account (#9): Hinweis auf jeder Seite, siehe components/layout/DemoHinweis.tsx
  demo: boolean;
}

// Prüft E-Mail und Passwort. Gesperrte und unbekannte Accounts liefern wie ein falsches Passwort null.
export async function verifyCredentials(db: Db, email: string, password: string): Promise<SessionUser | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) return null;
  const { rows } = await db.query(
    "SELECT id, email, name, password_hash, role, session_version, is_demo FROM users WHERE email = $1 AND disabled_at IS NULL",
    [normalized]
  );
  const user = rows[0];
  const match = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !match) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    sessionVersion: user.session_version,
    demo: user.is_demo === true,
  };
}

// Passwortprüfung für Aktionen, die eine erneute Eingabe verlangen (Account löschen). Ohne Account oder
// ohne Hash wird gegen den Dummy-Hash verglichen – gleiche Antwortzeit, Ergebnis false.
export async function verifyPassword(db: Db, userId: string, password: string): Promise<boolean> {
  const { rows } = await db.query("SELECT password_hash FROM users WHERE id = $1", [userId]);
  const hash: string | null = rows[0]?.password_hash ?? null;
  const match = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return hash !== null && match;
}

// Gleicht ein bestehendes Sitzungs-Token mit der Datenbank ab: Gesperrte oder gelöschte Accounts und
// alte Sitzungen (session_version erhöht, z. B. nach Passwortwechsel) verlieren den Zugang, die Rolle
// und das Demo-Kennzeichen kommen immer frisch aus der Datenbank.
export async function refreshToken<T extends Record<string, unknown>>(
  db: Db,
  token: T
): Promise<T | null> {
  const { rows } = await db.query("SELECT role, session_version, disabled_at, is_demo FROM users WHERE id = $1", [token.id]);
  const row = rows[0];
  if (!row || row.disabled_at || row.session_version !== token.sv) return null;
  return { ...token, role: row.role, demo: row.is_demo === true };
}

// Für den jwt-Callback. Ein Datenbankfehler darf keine 500-Seite auslösen. Fail-closed: ohne Prüfung
// gilt die Sitzung als ungültig und die Person landet auf der Login-Seite – jede geschützte Seite
// bräuchte die Datenbank ohnehin, und eine entwertete Sitzung überlebt so nie eine ausgefallene Prüfung.
export async function refreshTokenSafely<T extends Record<string, unknown>>(db: Db, token: T): Promise<T | null> {
  try {
    return await refreshToken(db, token);
  } catch (error) {
    console.error("Sitzungsprüfung fehlgeschlagen:", error);
    return null;
  }
}
