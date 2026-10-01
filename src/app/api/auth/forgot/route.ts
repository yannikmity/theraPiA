import { NextRequest, NextResponse, after } from "next/server";
import { withTransaction } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { isMailEnabled, sendMail } from "@/lib/mail";
import { forgotPasswordSchema } from "@/lib/validation";
import { requestPasswordReset } from "@/lib/services/accounts";
import { forgotThrottle, clientIp } from "@/lib/rate-limit";
import { FORGOT_RESPONSE_MESSAGE, passwordResetMail } from "@/lib/password-reset-mail";

export async function POST(request: NextRequest) {
  if (!isMailEnabled()) {
    return NextResponse.json({ error: "Nicht verfügbar" }, { status: 404 });
  }
  const body = await request.json().catch(() => null);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" }, { status: 400 });
  }
  const email = parsed.data.email;
  if (!forgotThrottle.allow(clientIp(request.headers), email)) {
    return NextResponse.json({ error: "Zu viele Versuche. Bitte später erneut versuchen." }, { status: 429 });
  }

  // Datenbank und Versand erst nach der Antwort: Antwort und Antwortzeit verraten nicht, ob die Adresse registriert ist.
  after(async () => {
    try {
      const result = await withTransaction((tx) => requestPasswordReset(tx, email));
      if (!result) return;
      const link = `${getConfig().NEXTAUTH_URL}/auth/reset?token=${result.token}`;
      await sendMail({ to: result.email, ...passwordResetMail(link) });
    } catch (error) {
      // Nur die Fehlerart: Meldungen von SMTP-Servern können die Adresse enthalten.
      const code = (error as { code?: unknown })?.code;
      console.error("Passwort vergessen: Versand fehlgeschlagen:", typeof code === "string" ? code : (error as Error)?.name ?? "Fehler");
    }
  });
  return NextResponse.json({ message: FORGOT_RESPONSE_MESSAGE });
}
