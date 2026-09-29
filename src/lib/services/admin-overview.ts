import type { Db } from "../db";
import { listUsers, type AdminUser } from "./accounts";
import { listOpenInvitations, purgeExpiredInvitationEmails, type AdminInvitation } from "./invitations";

export interface AdminOverview {
  users: AdminUser[];
  invitations: AdminInvitation[];
}

// Ohne Berechtigungsprüfung – die erledigt der Aufrufer (Seite bzw. createAction mit role "admin").
// Räumt vorher abgelaufene Einladungen auf (Adresse weg, siehe purgeExpiredInvitationEmails).
export async function loadAdminOverview(db: Db, now: Date = new Date()): Promise<AdminOverview> {
  await purgeExpiredInvitationEmails(db, now);
  const [users, invitations] = await Promise.all([listUsers(db), listOpenInvitations(db, now)]);
  return { users, invitations };
}
