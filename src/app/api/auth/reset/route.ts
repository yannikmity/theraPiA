import { NextRequest, NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { resetPasswordSchema } from "@/lib/validation";
import { resetPassword } from "@/lib/services/accounts";
import { resetLimiter, clientIp } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  if (!resetLimiter.check(clientIp(request.headers))) {
    return NextResponse.json({ error: "Zu viele Versuche. Bitte später erneut versuchen." }, { status: 429 });
  }
  try {
    const body = await request.json().catch(() => null);
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" }, { status: 400 });
    }
    const ok = await withTransaction((tx) => resetPassword(tx, parsed.data.token, parsed.data.password));
    if (!ok) {
      return NextResponse.json({ error: "Link ungültig oder abgelaufen" }, { status: 400 });
    }
    return NextResponse.json({ message: "Passwort zurückgesetzt" });
  } catch (error) {
    console.error("Reset error:", error);
    return NextResponse.json({ error: "Ein Fehler ist aufgetreten" }, { status: 500 });
  }
}
