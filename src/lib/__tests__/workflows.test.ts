// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const WORKFLOWS_DIR = path.resolve(__dirname, "../../../.github/workflows");
const read = (file: string) => readFileSync(path.join(WORKFLOWS_DIR, file), "utf8");

// Format, das Dependabot bei Updates mitpflegt: uses: owner/repo@<Commit-SHA> # vX.Y.Z
const PINNED = /uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/;

describe("GitHub-Workflows", () => {
  it.each(["ci.yml", "release.yml"])("%s pinnt jede Action auf einen Commit-SHA mit Versionskommentar", (file) => {
    const uses = read(file)
      .split("\n")
      .filter((line) => line.includes("uses:"))
      .filter((line) => !line.includes("./.github/workflows/")); // lokaler wiederverwendbarer Workflow
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) expect(line.trim()).toMatch(PINNED);
  });

  it("ci.yml erlaubt dem Token nur Lesen und ist per workflow_call aufrufbar", () => {
    const ci = read("ci.yml");
    expect(ci).toMatch(/^permissions:\n  contents: read$/m);
    expect(ci).toMatch(/^  workflow_call:/m);
  });

  it("release.yml baut das Image erst nach grüner CI und vergibt latest nicht an Vorabversionen", () => {
    const release = read("release.yml");
    expect(release).toMatch(/^  ci:\n    uses: \.\/\.github\/workflows\/ci\.yml$/m);
    expect(release).toMatch(/^    needs: ci$/m);
    // packages: write nur im Image-Job, nicht global
    expect(release).toMatch(/^permissions:\n  contents: read$/m);
    expect(release).not.toMatch(/^  packages: write$/m);
    // latest kommt aus flavor latest=auto (nur Semver ohne Pre-Release), nicht aus einem festen raw-Tag
    expect(release).not.toMatch(/value=latest/);
    expect(release).toMatch(/^\s+latest=auto$/m);
  });

  it("release.yml läuft nur für Semver-Tags (v1.2.3, v1.2.3-rc.1), nicht für beliebige v*-Tags", () => {
    const release = read("release.yml");
    expect(release).not.toMatch(/"v\*"/);
    expect(release).toMatch(/^\s+- "v\[0-9\]\+\.\[0-9\]\+\.\[0-9\]\+"$/m);
    expect(release).toMatch(/^\s+- "v\[0-9\]\+\.\[0-9\]\+\.\[0-9\]\+-\*"$/m);
  });

  // Alle Rechte-Zeilen (scope: level). Jede neue Zeile muss hier bewusst eingetragen werden – auch ein
  // nachträglich erweitertes Recht in einem Job.
  const permissionLines = (text: string) =>
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) =>
        /^(actions|attestations|checks|contents|deployments|discussions|id-token|issues|packages|pages|pull-requests|repository-projects|security-events|statuses): (read|write|none)$/.test(line)
      );

  it("vergibt nur contents: read – und packages: write allein im Image-Job von release.yml", () => {
    const ci = read("ci.yml");
    expect(ci).not.toMatch(/permissions: (write-all|read-all)/);
    expect(new Set(permissionLines(ci))).toEqual(new Set(["contents: read"]));

    const release = read("release.yml");
    expect(release).not.toMatch(/permissions: (write-all|read-all)/);
    expect(new Set(permissionLines(release))).toEqual(new Set(["contents: read", "packages: write"]));
    expect(release.match(/packages: write/g)).toHaveLength(1);
    expect(release).toMatch(
      /^  image:\n    needs: ci\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n      packages: write$/m
    );
  });
});
