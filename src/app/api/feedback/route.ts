import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getFeedbackStore } from "@/lib/feedback";
import { FEEDBACK_BODY_MAX_BYTES } from "@/lib/feedback/model";
import { decodeScreenshot, feedbackPayloadSchema } from "@/lib/feedback/validation";
import { readBodyWithLimit } from "@/lib/http-body";

export const dynamic = "force-dynamic";

// POST /api/feedback – speichert ein Feedback aus dem Widget als Markdown (+ PNG) in FEEDBACK_DIR.
// Die Person kommt ausschließlich aus der DB-geprüften Sitzung (auth()), nie aus dem Body. Route-Handler
// statt Server Action, weil Server Actions bei 1 MB Body enden – der Screenshot ist größer.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Erwartet application/json" }, { status: 415 });
  }
  // Grenze gilt für den angekündigten UND den tatsächlich gelesenen Body (Chunked ohne Content-Length).
  const body = await readBodyWithLimit(request, FEEDBACK_BODY_MAX_BYTES);
  if (!body.ok) {
    return body.reason === "too_large"
      ? NextResponse.json({ error: "Anfrage zu groß" }, { status: 413 })
      : NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body.text);
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 });
  }
  const parsed = feedbackPayloadSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" }, { status: 400 });
  }
  try {
    const { screenshot, ...fields } = parsed.data;
    const meta = await getFeedbackStore().save(
      {
        ...fields,
        userAgent: (request.headers.get("user-agent") ?? "").slice(0, 200),
        screenshotPng: decodeScreenshot(screenshot),
      },
      { id: session.user.id, email: session.user.email ?? "", name: session.user.name ?? "" }
    );
    return NextResponse.json({ id: meta.id, screenshot: meta.screenshot });
  } catch (error) {
    console.error("Feedback speichern fehlgeschlagen:", error);
    return NextResponse.json({ error: "Ein Fehler ist aufgetreten" }, { status: 500 });
  }
}
