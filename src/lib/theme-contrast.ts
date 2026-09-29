// WCAG-2-Kontrast für 6-stellige Hex-Farben. Genutzt vom Theme-Test, damit die Tokens in
// src/app/globals.css AA einhalten – der Test rechnet direkt mit den CSS-Werten.

export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error(`Kein 6-stelliger Hex-Wert: ${hex}`);
  const channel = (offset: number) => {
    const c = parseInt(match[1].slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

export function contrastRatio(a: string, b: string): number {
  const [brighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (brighter + 0.05) / (darker + 0.05);
}

// Liest alle `--name: #rrggbb;`-Deklarationen je :root-Block: [hell, dunkel] in Reihenfolge der Datei.
export function parseThemeTokens(css: string): Record<string, string>[] {
  return [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map(([, body]) =>
    Object.fromEntries(
      [...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(([, name, value]) => [name, value.toLowerCase()])
    )
  );
}

// Deckende Farbe von `fg` mit Deckkraft `alpha` (0–1) über `bg` – so erscheint z. B. Tailwinds `bg-input/30` auf einer
// Karte. Kanalweise in sRGB gemischt und gerundet wie beim Zeichnen.
export function blendHex(fg: string, bg: string, alpha: number): string {
  const channels = (hex: string) => {
    const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
    if (!match) throw new Error(`Kein 6-stelliger Hex-Wert: ${hex}`);
    return [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16));
  };
  const [f, b] = [channels(fg), channels(bg)];
  return `#${f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("")}`;
}
