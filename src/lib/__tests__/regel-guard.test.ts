// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Sperre gegen Rückfälle (#8): Regelwerte kommen nur über das Regelwerk. Standardwerte und standardRegelwerk()
// kennt nur das Regelmodul und der Service; die alten Konstanten gibt es nicht mehr; kein fest eingetipptes „1:4“.
const ROOT = path.resolve(__dirname, "../../..");
const SRC = path.join(ROOT, "src");

function dateien(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "__tests__" && entry !== "node_modules") dateien(full, out);
    } else if (/\.(tsx?|mjs)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry) && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

const QUELLEN = [...dateien(SRC), ...dateien(path.join(ROOT, "scripts"))];
const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join("/");
const ERLAUBT_STANDARD = [/^src\/lib\/ausbildungsregeln\//, /^src\/lib\/services\/ausbildungsregeln\.ts$/];

describe("Regel-Wächter (#8)", () => {
  it("die alten Regel-Konstanten gibt es nicht mehr", () => {
    const alt = /\b(THERAPY_TARGET_HOURS|SUPERVISION_TARGET_HOURS|RATIO_WARNING_THRESHOLD|RATIO_CRITICAL_THRESHOLD|GROUP_DOPPELSTUNDEN_TARGET|GROUP_DOPPELSTUNDEN_AMBULANZZEIT_TARGET|EBM_HONORAR_STAFFEL)\b/;
    expect(QUELLEN.filter((f) => alt.test(readFileSync(f, "utf8"))).map(rel)).toEqual([]);
  });

  it("Standardwerte nur im Regelmodul und im Service", () => {
    const standard = /\b(DEFAULT_AUSBILDUNGSREGELN|DEFAULT_EBM_STAFFELN|standardRegelwerk)\b/;
    const verstoesse = QUELLEN.filter((f) => standard.test(readFileSync(f, "utf8")))
      .map(rel)
      .filter((f) => !ERLAUBT_STANDARD.some((muster) => muster.test(f)));
    expect(verstoesse).toEqual([]);
  });

  it("kein fest eingetipptes Soll-Verhältnis in Oberflächen", () => {
    const fest = /1\s?:\s?4(?![\d,])/;
    const tsx = QUELLEN.filter((f) => f.endsWith(".tsx"));
    expect(tsx.filter((f) => fest.test(readFileSync(f, "utf8"))).map(rel)).toEqual([]);
  });
});
