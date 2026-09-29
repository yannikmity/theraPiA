import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getFeedbackStore } from "@/lib/feedback";

export const dynamic = "force-dynamic";

// GET /api/feedback/{id}/screenshot – PNG eines Feedbacks, nur für Admins. Der Store prüft die ID gegen das
// feste Muster, bevor ein Dateipfad entsteht; eine unbekannte oder ungültige ID ist schlicht 404.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
  }
  const { id } = await context.params;
  try {
    const png = await getFeedbackStore().readScreenshot(id);
    if (!png) {
      return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    }
    return new Response(new Uint8Array(png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="${id}.png"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Screenshot lesen fehlgeschlagen:", error);
    return NextResponse.json({ error: "Ein Fehler ist aufgetreten" }, { status: 500 });
  }
}
