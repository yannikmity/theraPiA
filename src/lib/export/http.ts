import { todayIso } from "../dates";

// Download-Antworten für Exporte. Dateiname nur ASCII (Content-Disposition ohne Kodierung), Datum als
// Kalendertag in Europe/Berlin (todayIso) – unabhängig von der Zeitzone des Servers (#47). Plain `Response`
// (Web-Standard), damit das Modul ohne next/server testbar ist.
export function exportFilename(stem: string, extension: "csv" | "json", now: Date = new Date()): string {
  return `therapia-${stem}-${todayIso(now)}.${extension}`;
}

export function attachmentResponse(body: string, filename: string, contentType: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
