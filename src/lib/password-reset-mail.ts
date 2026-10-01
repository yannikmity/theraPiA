// Antwort auf jede gültige Anfrage – unabhängig davon, ob es ein Konto gibt.
export const FORGOT_RESPONSE_MESSAGE = "Falls ein Konto mit dieser Adresse existiert, ist eine Mail unterwegs.";

// Nur Text: kein Name, keine Gesundheitsdaten, kein HTML, keine externen Bilder.
export function passwordResetMail(link: string): { subject: string; text: string } {
  return {
    subject: "theraPiA: Passwort zurücksetzen",
    text: [
      "Hallo,",
      "",
      "für dein Konto bei theraPiA wurde ein neues Passwort angefordert.",
      "Über diesen Link kannst du es festlegen (1 Stunde gültig, nur einmal nutzbar):",
      "",
      link,
      "",
      "Hast du das nicht angefordert, ignoriere diese Mail – dein Passwort bleibt unverändert.",
      "",
    ].join("\n"),
  };
}
