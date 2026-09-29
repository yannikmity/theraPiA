// Liest einen Request-Body mit fester Obergrenze. Content-Length allein reicht nicht: bei Chunked Transfer fehlt
// der Header, und ein manipulierter Client kann weniger ankündigen, als er schickt. Gelesen wird stückweise;
// sobald die Grenze fällt, wird der Stream abgebrochen – kein Puffer über maxBytes hinaus.
export type BodyRead = { ok: true; text: string } | { ok: false; reason: "too_large" | "unreadable" };

export async function readBodyWithLimit(request: Request, maxBytes: number): Promise<BodyRead> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return { ok: false, reason: "too_large" };
  if (!request.body) return { ok: true, text: "" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        // Scheitert der Abbruch selbst, bleibt es bei „zu groß“ – der Rest wird ohnehin nicht gelesen.
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  return { ok: true, text: new TextDecoder("utf-8").decode(Buffer.concat(chunks)) };
}
