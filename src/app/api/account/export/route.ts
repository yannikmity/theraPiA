import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadCreatedInvitations, loadUserData } from "@/lib/db/user-data";
import { buildDataExport } from "@/lib/export/data-export";
import { loadAbweichungen } from "@/lib/services/ausbildungsregeln";
import { attachmentResponse, exportFilename } from "@/lib/export/http";

export const dynamic = "force-dynamic";

// GET /api/account/export – Datenexport nach Art. 20 DSGVO als JSON-Download (eine Datei, lesbar formatiert).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  try {
    const userId = session.user.id;
    const data = await loadUserData(db, userId);
    const invitations = await loadCreatedInvitations(db, userId);
    const abweichungen = await loadAbweichungen(db, userId);
    const body = JSON.stringify(buildDataExport(data, invitations, abweichungen), null, 2);
    return attachmentResponse(body, exportFilename("datenexport", "json"), "application/json; charset=utf-8");
  } catch (error) {
    console.error("Datenexport fehlgeschlagen:", error);
    return NextResponse.json({ error: "Ein Fehler ist aufgetreten" }, { status: 500 });
  }
}
