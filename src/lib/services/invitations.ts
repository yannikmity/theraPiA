import type { Db } from "../db";
import { generateToken } from "../tokens";
import type { Role } from "../registration-policy";
import { INVITATION_EMAIL_RETENTION_MS, INVITATION_TTL_MS } from "../constants";

export interface AdminInvitation {
  id: string;
  email: string | null;
  role: Role;
  expiresAt: string;
  withDemoData: boolean;
}

// withDemoData (#9): wer sich über diese Einladung registriert, startet mit Beispieldaten (registerUser liest das
// Kennzeichen aus dieser Zeile, nie aus dem Formular).
export async function createInvitation(
  db: Db,
  input: { email: string | null; role: Role; createdBy: string; withDemoData?: boolean },
  now: Date = new Date()
): Promise<{ token: string; expiresAt: Date }> {
  const { token, hash } = generateToken();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
  // Beispieldaten gibt es nur für PiA-Accounts; das Schema prüft das schon, hier noch einmal für jeden Aufrufer.
  const withDemoData = input.withDemoData === true && input.role === "pia";
  await db.query(
    "INSERT INTO invitations (token_hash, email, role, created_by, expires_at, with_demo_data) VALUES ($1, $2, $3, $4, $5, $6)",
    [hash, input.email?.trim().toLowerCase() || null, input.role, input.createdBy, expiresAt, withDemoData]
  );
  return { token, expiresAt };
}

export async function listOpenInvitations(db: Db, now: Date = new Date()): Promise<AdminInvitation[]> {
  const { rows } = await db.query(
    "SELECT id, email, role, expires_at, with_demo_data FROM invitations WHERE used_at IS NULL AND expires_at > $1 ORDER BY created_at DESC",
    [now]
  );
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    expiresAt: new Date(r.expires_at).toISOString(),
    withDemoData: r.with_demo_data === true,
  }));
}

// Widerrufen = sofort ablaufen lassen; so bleibt nachvollziehbar, dass es die Einladung gab.
export async function revokeInvitation(db: Db, id: string, now: Date = new Date()): Promise<void> {
  await db.query("UPDATE invitations SET expires_at = $2 WHERE id = $1 AND used_at IS NULL", [id, now]);
}

// Nicht eingelöste Einladungen tragen die Adresse einer Person ohne Account. Nach Ablauf gibt es keinen Grund,
// sie zu behalten: die Zeile bleibt (nachvollziehbar, dass es die Einladung gab – wie bei revokeInvitation),
// die Adresse verschwindet nach der Frist. Läuft beim Laden der Administration. Liefert die Anzahl der Zeilen.
export async function purgeExpiredInvitationEmails(db: Db, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - INVITATION_EMAIL_RETENTION_MS);
  const result = await db.query(
    "UPDATE invitations SET email = NULL WHERE used_at IS NULL AND email IS NOT NULL AND expires_at < $1",
    [cutoff]
  );
  return result.rowCount ?? 0;
}
