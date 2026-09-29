import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { changePasswordSchema } from "@/lib/validation";
import { changePassword } from "@/lib/services/accounts";

// POST /api/auth/change-password – die Person kommt aus der DB-geprüften Sitzung; die Prüfung des aktuellen
// Passworts ist pro Account gedrosselt (429), siehe services/password-check.ts.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" }, { status: 400 });
  }
  try {
    const result = await changePassword(db, session.user.id, parsed.data.currentPassword, parsed.data.newPassword);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: result.code === "limited" ? 429 : 400 });
    }
    return NextResponse.json({ message: "Passwort erfolgreich geändert" });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json({ error: "Ein Fehler ist aufgetreten" }, { status: 500 });
  }
}
