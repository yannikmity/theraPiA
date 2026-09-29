import { LOGIN_WINDOW_MINUTES } from "./constants";

// Fehlercodes der Anmeldung. NextAuth reicht den Code als `code`-Parameter an den Browser durch;
// er darf deshalb nichts verraten, was der Server nicht ohnehin zeigt – insbesondere nicht, ob eine
// Adresse existiert: unbekannte Adresse, falsches Passwort und gesperrter Account sind alle "credentials".
export type LoginErrorCode = "credentials" | "rate_limited" | "unavailable";

export const LOGIN_ERROR_MESSAGES: Record<LoginErrorCode, string> = {
  credentials: "E-Mail oder Passwort falsch",
  rate_limited: `Zu viele Anmeldeversuche. Bitte in ${LOGIN_WINDOW_MINUTES} Minuten erneut versuchen.`,
  unavailable: "Anmeldung derzeit nicht möglich. Bitte später erneut versuchen.",
};

export function isLoginErrorCode(code: unknown): code is LoginErrorCode {
  return typeof code === "string" && Object.hasOwn(LOGIN_ERROR_MESSAGES, code);
}

// Fehlende oder fremde Codes (z. B. CSRF-Fehler von NextAuth) werden wie falsche Zugangsdaten gemeldet.
export function loginErrorMessage(code: string | undefined): string {
  return LOGIN_ERROR_MESSAGES[isLoginErrorCode(code) ? code : "credentials"];
}
