// @vitest-environment node
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// Doku-Wächter (#9): relative Links und Anker in der Doku für Betreiber:innen und Mitwirkende müssen auflösen.
// Anker in GitHub-Schreibweise: Kleinbuchstaben, Satzzeichen entfernt (Umlaute bleiben), Leerzeichen → „-“,
// gleiche Überschriften bekommen -1, -2 …
const ROOT = path.resolve(__dirname, "../../..");
const DATEIEN = [
  ...readdirSync(ROOT).filter((f) => f.endsWith(".md")),
  ...readdirSync(path.join(ROOT, "docs/betrieb"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => `docs/betrieb/${f}`),
];

function githubAnker(ueberschrift: string): string {
  return ueberschrift
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function ohneCodeBloecke(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "");
}

function anker(datei: string): Set<string> {
  const text = ohneCodeBloecke(readFileSync(path.join(ROOT, datei), "utf8"));
  const gesehen = new Map<string, number>();
  const out = new Set<string>();
  for (const m of text.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const basis = githubAnker(m[1]);
    const n = gesehen.get(basis) ?? 0;
    gesehen.set(basis, n + 1);
    out.add(n === 0 ? basis : `${basis}-${n}`);
  }
  return out;
}

function relativeLinks(datei: string): string[] {
  const text = ohneCodeBloecke(readFileSync(path.join(ROOT, datei), "utf8")).replace(/`[^`\n]*`/g, "");
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((href) => !/^(https?:|mailto:)/.test(href));
}

describe("Doku-Links", () => {
  it("findet die Doku-Dateien", () => {
    expect(DATEIEN).toContain("README.md");
    expect(DATEIEN).toContain("docs/betrieb/installation.md");
  });

  it("bildet Anker wie GitHub", () => {
    expect(githubAnker("9. Ausbildungsregeln")).toBe("9-ausbildungsregeln");
    expect(githubAnker("Export und Löschung")).toBe("export-und-löschung");
    expect(githubAnker("Optionale Nutzungsstatistik (Umami)")).toBe("optionale-nutzungsstatistik-umami");
    expect(githubAnker("5.3 Zurück zur vorigen Version (Rollback)")).toBe("53-zurück-zur-vorigen-version-rollback");
  });

  it.each(DATEIEN)("%s: jeder relative Link und Anker löst auf", (datei) => {
    const fehler: string[] = [];
    for (const href of relativeLinks(datei)) {
      const [pfad, fragment] = href.split("#");
      const ziel = pfad ? path.join(path.dirname(datei), pfad) : datei;
      if (!existsSync(path.join(ROOT, ziel))) {
        fehler.push(`${href}: Datei fehlt`);
        continue;
      }
      if (fragment && ziel.endsWith(".md") && !anker(ziel).has(decodeURIComponent(fragment))) {
        fehler.push(`${href}: Anker fehlt`);
      }
    }
    expect(fehler).toEqual([]);
  });
});
