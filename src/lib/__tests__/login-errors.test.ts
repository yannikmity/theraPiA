import { describe, it, expect } from "vitest";
import { loginErrorMessage, isLoginErrorCode } from "../login-errors";

describe("loginErrorMessage", () => {
  it("nennt beim Limit das Zeitfenster", () => {
    expect(loginErrorMessage("rate_limited")).toBe("Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.");
  });

  it("meldet Datenbankausfälle als vorübergehend", () => {
    expect(loginErrorMessage("unavailable")).toBe("Anmeldung derzeit nicht möglich. Bitte später erneut versuchen.");
  });

  it("fällt bei fehlendem oder fremdem Code auf die neutrale Meldung zurück", () => {
    expect(loginErrorMessage(undefined)).toBe("E-Mail oder Passwort falsch");
    expect(loginErrorMessage("credentials")).toBe("E-Mail oder Passwort falsch");
    expect(loginErrorMessage("constructor")).toBe("E-Mail oder Passwort falsch");
    expect(isLoginErrorCode("toString")).toBe(false);
  });
});
