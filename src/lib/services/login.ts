import type { Db } from "../db";
import type { LoginThrottle } from "../rate-limit";
import type { LoginErrorCode } from "../login-errors";
import { verifyCredentials, type SessionUser } from "./session";

export type LoginResult = { ok: true; user: SessionUser } | { ok: false; code: LoginErrorCode };

// Anmeldeversuch mit Drosselung. Die Drosselung greift vor der (teuren) Passwortprüfung. Der Code
// verrät nie, ob eine Adresse existiert; ein Datenbankfehler wird als "unavailable" gemeldet, damit
// er im Formular nicht als „Passwort falsch“ erscheint.
export async function attemptLogin(
  db: Db,
  throttle: LoginThrottle,
  input: { email: string; password: string; clientIp: string }
): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) return { ok: false, code: "credentials" };
  if (!throttle.allow(input.clientIp, email)) return { ok: false, code: "rate_limited" };

  try {
    const user = await verifyCredentials(db, email, input.password);
    if (!user) return { ok: false, code: "credentials" };
    throttle.reset(input.clientIp, email);
    return { ok: true, user };
  } catch (error) {
    console.error("Anmeldung fehlgeschlagen (Datenbank):", error);
    return { ok: false, code: "unavailable" };
  }
}
