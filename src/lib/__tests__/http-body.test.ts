// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readBodyWithLimit } from "../http-body";

const ENDPOINT = "http://localhost:3200/api/feedback";
const KIB = 1024;

// Body als Stream ohne Content-Length – so kommt eine Chunked-Anfrage beim Handler an.
function streamed(chunks: Uint8Array[], onCancel?: () => void, failAfter?: number): Request {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (failAfter !== undefined && sent >= failAfter) {
        controller.error(new Error("Verbindung abgebrochen"));
        return;
      }
      const chunk = chunks.shift();
      if (chunk) {
        sent++;
        controller.enqueue(chunk);
      } else controller.close();
    },
    cancel() {
      onCancel?.();
    },
  });
  return new Request(ENDPOINT, { method: "POST", body, duplex: "half" } as RequestInit);
}

describe("readBodyWithLimit", () => {
  it("liest einen Body innerhalb der Grenze als Text", async () => {
    const req = new Request(ENDPOINT, { method: "POST", body: '{"text":"hallo"}' });
    expect(await readBodyWithLimit(req, 100)).toEqual({ ok: true, text: '{"text":"hallo"}' });
  });

  it("liest einen leeren Body als leeren Text", async () => {
    expect(await readBodyWithLimit(new Request(ENDPOINT, { method: "POST" }), 100)).toEqual({ ok: true, text: "" });
  });

  it("lehnt einen angekündigt zu großen Body ab, ohne ihn zu lesen", async () => {
    const req = new Request(ENDPOINT, { method: "POST", headers: { "content-length": "1000" }, body: "x" });
    expect(await readBodyWithLimit(req, 100)).toEqual({ ok: false, reason: "too_large" });
  });

  it("lehnt einen Chunked-Body ab, sobald die Grenze fällt, und bricht den Stream ab", async () => {
    let cancelled = false;
    const chunks = Array.from({ length: 5 }, () => new Uint8Array(KIB));
    const req = streamed(chunks, () => (cancelled = true));
    expect(await readBodyWithLimit(req, 3 * KIB)).toEqual({ ok: false, reason: "too_large" });
    expect(cancelled).toBe(true);
    expect(chunks.length).toBeGreaterThanOrEqual(1); // nicht alles gelesen
  });

  it("lehnt einen Body ab, der mehr enthält als der Header ankündigt", async () => {
    const chunks = [new Uint8Array(2 * KIB)];
    const req = new Request(ENDPOINT, {
      method: "POST",
      headers: { "content-length": "10" },
      body: new ReadableStream<Uint8Array>({
        pull(c) {
          const chunk = chunks.shift();
          if (chunk) c.enqueue(chunk);
          else c.close();
        },
      }),
      duplex: "half",
    } as RequestInit);
    expect(await readBodyWithLimit(req, KIB)).toEqual({ ok: false, reason: "too_large" });
  });

  it("meldet einen abgebrochenen Stream als unreadable", async () => {
    const req = streamed([new Uint8Array(KIB), new Uint8Array(KIB)], undefined, 1);
    expect(await readBodyWithLimit(req, 10 * KIB)).toEqual({ ok: false, reason: "unreadable" });
  });
});
