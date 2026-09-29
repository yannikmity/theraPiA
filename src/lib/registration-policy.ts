import type { SetupCheck } from "./setup-token";

export type Role = "admin" | "pia";
export type RegistrationMode = "open" | "invite" | "closed";

export interface RegistrationContext {
  mode: RegistrationMode;
  userCount: number;
  invitation: { role: Role; email: string | null } | null;
  email: string;
  // Ergebnis der Prüfung des Einrichtungscodes (checkSetupToken); zählt nur für den ersten Account.
  setup?: SetupCheck;
}

export const SETUP_BLOCKED_MESSAGE =
  "Einrichtung gesperrt: Für den ersten Account SETUP_TOKEN in der .env setzen und die App neu starten";

export type RegistrationDecision = { allowed: true; role: Role } | { allowed: false; reason: string };

export function decideRegistration(ctx: RegistrationContext): RegistrationDecision {
  if (ctx.userCount === 0) {
    if (ctx.setup === "missing-config") return { allowed: false, reason: SETUP_BLOCKED_MESSAGE };
    if (ctx.setup === "wrong-code") return { allowed: false, reason: "Einrichtungscode fehlt oder ist falsch" };
    return { allowed: true, role: "admin" };
  }
  if (ctx.mode === "closed") return { allowed: false, reason: "Registrierung ist auf dieser Instanz deaktiviert" };
  if (ctx.invitation) {
    const bound = ctx.invitation.email?.trim().toLowerCase();
    if (bound && bound !== ctx.email.trim().toLowerCase()) {
      return { allowed: false, reason: "Diese Einladung gilt für eine andere E-Mail-Adresse" };
    }
    return { allowed: true, role: ctx.invitation.role };
  }
  if (ctx.mode === "open") return { allowed: true, role: "pia" };
  return { allowed: false, reason: "Registrierung nur mit Einladung möglich" };
}
