import { describe, it, expect } from "vitest";
import { decideRegistration } from "../registration-policy";

const base = { mode: "invite" as const, userCount: 3, invitation: null, email: "pia@example.com" };

describe("decideRegistration", () => {
  it("macht den ersten Account zum Admin, egal in welchem Modus", () => {
    expect(decideRegistration({ ...base, mode: "closed", userCount: 0 })).toEqual({ allowed: true, role: "admin" });
  });

  it("lässt im Modus invite ohne Einladung niemanden rein", () => {
    expect(decideRegistration(base)).toEqual({ allowed: false, reason: "Registrierung nur mit Einladung möglich" });
  });

  it("übernimmt die Rolle aus der Einladung", () => {
    expect(decideRegistration({ ...base, invitation: { role: "admin", email: null } })).toEqual({ allowed: true, role: "admin" });
  });

  it("prüft eine an eine Adresse gebundene Einladung ohne Groß-/Kleinschreibung", () => {
    const invitation = { role: "pia" as const, email: "PIA@example.com" };
    expect(decideRegistration({ ...base, invitation })).toEqual({ allowed: true, role: "pia" });
    expect(decideRegistration({ ...base, invitation, email: "andere@example.com" })).toEqual({
      allowed: false,
      reason: "Diese Einladung gilt für eine andere E-Mail-Adresse",
    });
  });

  it("erlaubt im Modus open die Registrierung als pia", () => {
    expect(decideRegistration({ ...base, mode: "open" })).toEqual({ allowed: true, role: "pia" });
  });

  it("lässt im Modus closed auch mit Einladung niemanden rein", () => {
    expect(decideRegistration({ ...base, mode: "closed", invitation: { role: "pia", email: null } })).toEqual({
      allowed: false,
      reason: "Registrierung ist auf dieser Instanz deaktiviert",
    });
  });
});
