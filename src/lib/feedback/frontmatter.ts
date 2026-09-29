// Frontmatter ohne YAML-Abhängigkeit: je Feld eine Zeile `key: <JSON>`. JSON-Strings sind gültige YAML-Skalare,
// Zeilenumbrüche und Anführungszeichen bleiben escaped in einer Zeile – die Datei bleibt grep-bar.
export type FrontmatterValue = string | number | boolean;

export function serializeFrontmatter(meta: Record<string, FrontmatterValue>): string {
  const lines = Object.entries(meta).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

// Windows-Zeilenenden (Datei auf einem anderen System bearbeitet) werden vorab normalisiert – sonst würde
// eine solche Datei weder gelesen noch bei der Account-Löschung gefunden.
export function parseFrontmatter(input: string): { meta: Record<string, FrontmatterValue>; body: string } {
  const text = input.replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) return { meta: {}, body: text };
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return { meta: {}, body: text };
  const meta: Record<string, FrontmatterValue> = {};
  for (const line of text.slice(4, end).split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const raw = line.slice(colon + 1).trim();
    try {
      const value: unknown = JSON.parse(raw);
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") meta[key] = value;
    } catch {
      meta[key] = raw;
    }
  }
  return { meta, body: text.slice(end + 5) };
}
