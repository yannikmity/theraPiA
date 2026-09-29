import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Sperre gegen Rückfälle: Farben nur über Theme-Tokens, keine alten Utility-Klassen, kein Hex im JSX.
const SRC = path.resolve(__dirname, "../..");

// .ts und .tsx (z. B. Klassen-Maps in Hilfsdateien); Tests und Typdeklarationen bleiben außen vor.
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "__tests__") sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry) && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

const RULES: { name: string; pattern: RegExp }[] = [
  {
    name: "Tailwind-Standardpalette statt Theme-Token",
    pattern:
      /\b(?:bg|text|border|ring|divide|from|to|via|fill|stroke|outline|shadow|accent|caret|decoration|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
  },
  {
    name: "Weiß/Schwarz statt Theme-Token",
    pattern: /\b(?:bg|text|border|ring|divide|fill|stroke|outline)-(?:white|black)(?![-\w])/,
  },
  {
    name: "alte theraPiA-Farbskala statt Token",
    pattern: /\b(?:bg|text|border|ring|divide)-(?:primary|success|warning|danger)-\d{2,3}\b/,
  },
  {
    name: "Hex-Wert in JSX-Attribut",
    pattern: /(?:className|style|fill|stroke|color)\s*=\s*[^>\n]{0,160}#[0-9a-fA-F]{3,8}\b/,
  },
  {
    name: "alte Utility-Klasse (card, btn-*, input-field, badge)",
    // Nicht nach "." und nicht vor ":" – sonst schlagen Objektschlüssel wie `badge: "success-soft"` und
    // Zugriffe wie `config.badge` (RatioIndicator) fälschlich an; als Klassenname kommt beides nicht vor.
    pattern: /(?<![-\w/.])(?:card|btn-primary|btn-secondary|btn-success|input-field|badge)(?![-\w:])/,
  },
  {
    name: "„Std.“ (Uhrzeit) statt Behandlungsstunden/SV-Einheiten",
    pattern: /\bStd\./,
  },
];

describe("Style-Guard", () => {
  it("findet in src (.ts und .tsx) keine verbotenen Muster", () => {
    const findings: string[] = [];
    const files = sourceFiles(SRC);
    for (const file of files) {
      // data-slot="card"/"badge" der shadcn-Komponenten sind keine Klassen.
      const text = readFileSync(file, "utf8").replace(/data-slot="[^"]*"/g, "");
      text.split("\n").forEach((line, index) => {
        for (const rule of RULES) {
          if (rule.pattern.test(line)) {
            findings.push(`${path.relative(SRC, file)}:${index + 1} ${rule.name}: ${line.trim().slice(0, 100)}`);
          }
        }
      });
    }
    expect(findings).toEqual([]);
  });

  it("globals.css enthält keine Übergangsklassen und keine alte Farbskala mehr", () => {
    const css = readFileSync(path.join(SRC, "app/globals.css"), "utf8");
    expect(css).not.toMatch(/\.(card|btn-primary|btn-secondary|btn-success|input-field|badge)\s*\{/);
    expect(css).not.toMatch(/--color-(primary|success|warning|danger)-\d{2,3}:/);
    expect(css).not.toMatch(/@layer components/);
  });

  it("globals.css druckt hell auf A4: dunkles Schema nur für screen, @page hochkant", () => {
    const css = readFileSync(path.join(SRC, "app/globals.css"), "utf8");
    expect(css).toMatch(/@media screen and \(prefers-color-scheme: dark\)/);
    expect(css).not.toMatch(/@media \(prefers-color-scheme: dark\)/);
    expect(css).toMatch(/@page\s*\{[^}]*size:\s*A4 portrait/);
    expect(css).toMatch(/print:bg-card/);
  });
});
