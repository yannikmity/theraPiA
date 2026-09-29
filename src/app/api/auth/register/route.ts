import { NextRequest, NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { registerSchema } from "@/lib/validation";
import { registerUser } from "@/lib/services/registration";
import { checkSetupToken } from "@/lib/setup-token";
import { registerLimiter, clientIp } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  if (!registerLimiter.check(clientIp(request.headers))) {
    return NextResponse.json({ error: "Zu viele Versuche. Bitte später erneut versuchen." }, { status: 429 });
  }
  try {
    const body = await request.json().catch(() => null);
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" }, { status: 400 });
    }
    const { invite, setupToken, ...input } = parsed.data;
    const config = getConfig();
    const setup = checkSetupToken(config, setupToken);
    const result = await withTransaction((tx) =>
      registerUser(tx, { ...input, inviteToken: invite ?? null, setup }, config.REGISTRATION_MODE)
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    // created: false (Adresse schon vergeben, Modus open oder mit Einladung) wird bewusst wie ein Erfolg
    // beantwortet – gleicher Status, gleicher Text, gleiche Weiterleitung. Sonst ließe sich abfragen, wer auf
    // dieser Instanz einen Account hat (siehe registerUser in services/registration.ts).
    return NextResponse.json({ message: "Registrierung abgeschlossen" }, { status: 201 });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ error: "Ein Fehler ist aufgetreten" }, { status: 500 });
  }
}
