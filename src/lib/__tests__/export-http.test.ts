// @vitest-environment node
import { describe, it, expect } from "vitest";
import { attachmentResponse, exportFilename } from "../export/http";

describe("Export-Antworten", () => {
  it("baut den Dateinamen aus Präfix, Berliner Kalendertag und Endung", () => {
    expect(exportFilename("therapiesitzungen", "csv", new Date("2026-09-26T12:00:00Z"))).toBe(
      "therapia-therapiesitzungen-2026-09-26.csv"
    );
    // 22:30 UTC = 00:30 MESZ am Folgetag – der Dateiname trägt den Berliner Tag, egal wo der Server läuft.
    expect(exportFilename("therapiesitzungen", "csv", new Date("2026-09-25T22:30:00Z"))).toBe(
      "therapia-therapiesitzungen-2026-09-26.csv"
    );
    expect(exportFilename("datenexport", "json", new Date("2026-12-31T23:30:00Z"))).toBe("therapia-datenexport-2027-01-01.json");
  });

  it("liefert einen Download mit Inhaltstyp, Dateiname und ohne Caching", async () => {
    const res = attachmentResponse("\uFEFFDatum\r\n", "therapia-x.csv", "text/csv; charset=utf-8");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="therapia-x.csv"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    // Response.text() entfernt ein führendes BOM beim Dekodieren; die Bytes müssen es aber enthalten (Excel).
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)).toBe("\uFEFFDatum\r\n");
  });
});
