import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadUserData } from "@/lib/db/user-data";
import { CSV_EXPORTS, isCsvExportKey, parseExportYear } from "@/lib/export/csv-files";
import { attachmentResponse, exportFilename } from "@/lib/export/http";

export const dynamic = "force-dynamic";

// GET /api/export/csv/{therapy-sessions|supervisions|group-sessions|patients|expenses}
// Ausgaben optional mit ?jahr=JJJJ (nur dieses Kalenderjahr, Jahr im Dateinamen); andere Exporte ignorieren den Parameter.
// auth() prüft die Sitzung gegen die Datenbank (jwt-Callback): gelöschte oder gesperrte Accounts
// bekommen 401, auch mit kryptografisch gültigem Cookie. Ohne Cookie antwortet schon der Proxy mit 401.
export async function GET(request: Request, context: { params: Promise<{ entity: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  const { entity } = await context.params;
  if (!isCsvExportKey(entity)) {
    return NextResponse.json({ error: "Unbekannter Export" }, { status: 404 });
  }
  const { fileStem, byYear, build } = CSV_EXPORTS[entity];
  const yearParam = byYear ? new URL(request.url).searchParams.get("jahr") : null;
  const year = yearParam === null ? undefined : parseExportYear(yearParam);
  if (yearParam !== null && year === undefined) {
    return NextResponse.json({ error: "Ungültiges Jahr" }, { status: 400 });
  }
  try {
    const data = await loadUserData(db, session.user.id);
    // Mit Jahr: therapia-ausgaben-2026-stand-2026-09-29.csv – das Jahr der Daten, dann der Tag des Exports.
    const stem = year === undefined ? fileStem : `${fileStem}-${year}-stand`;
    return attachmentResponse(build(data, { year }), exportFilename(stem, "csv"), "text/csv; charset=utf-8");
  } catch (error) {
    console.error("CSV-Export fehlgeschlagen:", error);
    return NextResponse.json({ error: "Ein Fehler ist aufgetreten" }, { status: 500 });
  }
}
