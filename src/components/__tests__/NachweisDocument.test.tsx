import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { cssString, NachweisDocument } from "../nachweis/NachweisDocument";
import { buildNachweis } from "../../lib/nachweis";
import { sampleUserData } from "../../lib/__tests__/helpers/user-data-fixture";
import { resolveRegelwerk, standardRegelwerk } from "../../lib/ausbildungsregeln/resolve";
import { KEINE_ABWEICHUNGEN } from "../../lib/ausbildungsregeln/model";

const STANDARD = standardRegelwerk();

const Q1 = { from: "2026-01-01", to: "2026-03-31", supervisorId: null };
const NOW = new Date("2026-09-26T12:00:00.000Z");
const region = (name: RegExp | string) => screen.getByRole("region", { name });
const bodyRows = (name: RegExp) => within(region(name)).getAllByRole("row").slice(1);

describe("NachweisDocument", () => {
  it("zeigt Kopf, Zeitraum und Erstellungsdatum für Menschen formatiert", () => {
    render(<NachweisDocument nachweis={buildNachweis(sampleUserData(), Q1, STANDARD, NOW)} />);
    expect(screen.getByRole("heading", { level: 2, name: "Ausbildungsnachweis" })).toBeDefined();
    // Name steht im Kopf und unter der Unterschriftslinie.
    expect(screen.getAllByText("PiA A")).toHaveLength(2);
    expect(screen.getByText("a@example.com")).toBeDefined();
    expect(screen.getByText("01.01.2026 – 31.03.2026")).toBeDefined();
    expect(screen.getByText("26.09.2026")).toBeDefined();
  });

  it("listet Therapiesitzungen mit Datum, Chiffre, Kategorie, Dauer und Supervision – ohne Notizen", () => {
    render(<NachweisDocument nachweis={buildNachweis(sampleUserData(), Q1, STANDARD, NOW)} />);
    const rows = bodyRows(/Therapiesitzungen \(3\)/);
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("10.01.2026");
    expect(rows[0].textContent).toContain("A-01");
    expect(rows[0].textContent).toContain("Probatorik");
    expect(rows[0].textContent).toContain("50 Min");
    expect(rows[0].textContent).toContain("20.02.2026 (Supervision Eins)");
    expect(rows[2].textContent).toContain("Bezugsperson");
    expect(screen.queryByText(/Erstgespräch/)).toBeNull();
    expect(screen.queryByText(/SUMME/)).toBeNull();
  });

  it("listet Supervisionen mit Art und besprochenen Sitzungen sowie Doppelstunden mit Teilnehmenden", () => {
    render(<NachweisDocument nachweis={buildNachweis(sampleUserData(), Q1, STANDARD, NOW)} />);
    const sv = bodyRows(/Supervisionen \(2\)/);
    expect(sv[0].textContent).toContain("Supervision Eins");
    expect(sv[0].textContent).toContain("Einzel");
    expect(sv[0].textContent).toContain("60 Min");
    expect(sv[0].textContent).toContain("A-01 (10.01.2026), A-02 (14.02.2026)");
    const gs = bodyRows(/Doppelstunden \(1\)/);
    expect(gs[0].textContent).toContain("12.01.2026");
    expect(gs[0].textContent).toContain("Gruppe Montag");
    expect(gs[0].textContent).toContain("ja");
    expect(gs[0].textContent).toContain("100 Min");
    expect(gs[0].textContent).toContain("05.04.2026 (Supervision Eins)");
  });

  it("summiert Einträge, Behandlungsstunden je Kategorie, SV-Einheiten und das Verhältnis mit Dezimalkomma", () => {
    render(<NachweisDocument nachweis={buildNachweis(sampleUserData(), Q1, STANDARD, NOW)} />);
    const text = region("Summen").textContent ?? "";
    expect(text).toContain("3 Sitzungen, 3,20 Behandlungsstunden");
    expect(text).toContain("davon Probatorik 1,00, Behandlung 1,20, Bezugsperson 1,00");
    expect(text).not.toMatch(/Sprechstunde|Gesprächsziffer/);
    expect(text).toContain("2 Supervisionen, 3,00 SV-Einheiten");
    expect(text).toContain("1 Doppelstunde, 2,00 Einheiten à 50 Min");
    expect(text).not.toMatch(/Doppelstunden?, [\d,]+ Behandlungsstunden/);
    expect(text).toContain("Doppelstunden (Gruppe) werden gesondert gezählt und nicht auf die 600 Behandlungsstunden angerechnet.");
    expect(text).not.toContain("Doppelstunde = 2");
    expect(text).toContain("1 : 1,1");
    expect(text).toContain("zu je 50 Minuten");
    expect(text).not.toContain("Std.");
  });

  it("nennt Sprechstunde und Gesprächsziffer unter „davon“ nur mit Stunden (#66)", () => {
    const data = sampleUserData();
    data.therapySessions[0].category = "sprechstunde"; // 50 Min
    data.therapySessions[1].category = "gespraechsziffer"; // 60 Min
    render(<NachweisDocument nachweis={buildNachweis(data, Q1, STANDARD, NOW)} />);
    expect(region("Summen").textContent).toContain(
      "davon Sprechstunde 1,00, Probatorik 0,00, Behandlung 0,00, Bezugsperson 1,00, Gesprächsziffer 1,20"
    );
  });

  it("ohne Supervisor:in unterschreibt das Institut, mit Supervisor:in diese – mit Namen", () => {
    const { unmount } = render(<NachweisDocument nachweis={buildNachweis(sampleUserData(), Q1, STANDARD, NOW)} />);
    expect(screen.getByText("Unterschrift Institut/Ambulanz")).toBeDefined();
    expect(screen.queryByText("Unterschrift Supervisor:in")).toBeNull();
    unmount();
    render(<NachweisDocument nachweis={buildNachweis(sampleUserData(), { ...Q1, supervisorId: "s-1" }, STANDARD, NOW)} />);
    expect(screen.getByText("Unterschrift Supervisor:in")).toBeDefined();
    expect(screen.queryByText("Unterschrift Institut/Ambulanz")).toBeNull();
    expect(within(region("Unterschriften")).getByText("Supervision Eins")).toBeDefined();
    expect(within(region("Unterschriften")).getByText("PiA A")).toBeDefined();
    expect(screen.getByText("Ort, Datum")).toBeDefined();
  });

  it("zeigt leere Abschnitte und ein fehlendes Verhältnis verständlich", () => {
    render(<NachweisDocument nachweis={buildNachweis(sampleUserData(), { from: "2025-01-01", to: "2025-12-31", supervisorId: null }, STANDARD, NOW)} />);
    expect(screen.getByText("Keine Therapiesitzungen im Zeitraum.")).toBeDefined();
    expect(screen.getByText("Keine Supervisionen im Zeitraum.")).toBeDefined();
    expect(screen.getByText("Keine Doppelstunden im Zeitraum.")).toBeDefined();
    expect(region("Summen").textContent).toContain("keine Supervision im Zeitraum");
  });

  it("zeigt bei Supervision ohne Therapiesitzungen kein Verhältnis „1 : 0,0“", () => {
    const data = { ...sampleUserData(), therapySessions: [] };
    render(<NachweisDocument nachweis={buildNachweis(data, Q1, STANDARD, NOW)} />);
    const text = region("Summen").textContent ?? "";
    expect(text).toContain("– (keine Therapiesitzungen)");
    expect(text).not.toContain("1 : 0,0");
  });

  it("hält Tabellenzeilen sowie Summen und Unterschriften beim Druck zusammen", () => {
    const { container } = render(<NachweisDocument nachweis={buildNachweis(sampleUserData(), Q1, STANDARD, NOW)} />);
    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBe(6);
    rows.forEach((tr) => expect(tr.className).toContain("break-inside-avoid"));
    container.querySelectorAll("thead").forEach((thead) => expect(thead.className).toContain("table-header-group"));
    // Summen und Unterschriften stehen in einem gemeinsamen Block ohne Seitenumbruch: Die Unterschriften landen nie
    // allein auf einer Seite, getrennt von dem, was sie bestätigen.
    const block = region("Summen").closest(".break-inside-avoid");
    expect(block).not.toBeNull();
    expect(block?.contains(region("Unterschriften"))).toBe(true);
    expect(container.querySelector("[data-nachweis-document]")).not.toBeNull();
  });

  it("druckt auf jeder Seite eine Fußzeile mit Name, Zeitraum und „Seite X von Y“ – als @page-Randbox", () => {
    const { container } = render(<NachweisDocument nachweis={buildNachweis(sampleUserData(), Q1, STANDARD, NOW)} />);
    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).toContain("@page");
    expect(css).toContain("@bottom-center");
    expect(css).toContain('content: "Ausbildungsnachweis PiA A · 01.01.2026 – 31.03.2026" " · Seite " counter(page) " von " counter(pages)');
    expect(css).toContain("color: var(--foreground)");
  });

  it("escapt den Namen in der Fußzeile, damit weder die CSS-Zeichenkette noch das <style>-Element vorzeitig enden", () => {
    expect(cssString('Eva "Quote" </style>')).toBe('"Eva \\22 Quote\\22  \\3c /style\\3e "');
    expect(cssString("a\\b\nc")).toBe('"a\\5c b\\a c"');
    expect(cssString("PiA A")).toBe('"PiA A"');
    expect(cssString("a\fb")).toBe('"a\\c b"');
    expect(cssString("a\0b")).toBe('"a\\0 b"');
  });
  it("macht die Scroll-Container der Tabellen per Tastatur erreichbar und benennt sie", () => {
    render(<NachweisDocument nachweis={buildNachweis(sampleUserData(), Q1, STANDARD, NOW)} />);
    for (const name of ["Tabelle Therapiesitzungen", "Tabelle Supervisionen", "Tabelle Doppelstunden"]) {
      const group = screen.getByRole("group", { name });
      expect(group.getAttribute("tabindex")).toBe("0");
      expect(group.className).toContain("overflow-x-auto");
      expect(group.className).toContain("focus-visible:ring-");
      expect(group.querySelector("table")).not.toBeNull();
      // Fokussiert gedruckt stünde der Ring im PDF (#56). Mit !, weil focus-visible:ring-* spezifischer ist als print:.
      expect(group.className.split(/\s+/)).toContain("print:ring-0!");
    }
  });

  it("zeigt Soll und Behandlungsstunden-Ziel aus dem Regelwerk", () => {
    const regelwerk = resolveRegelwerk({
      instanz: { ...STANDARD.regeln, behandlungsstundenZiel: 500, verhaeltnisWarnung: 3, verhaeltnisKritisch: 4 },
      abweichungen: null,
      ebmStaffeln: [],
    });
    const { container } = render(<NachweisDocument nachweis={buildNachweis(sampleUserData(), Q1, regelwerk, NOW)} />);
    expect(container.textContent).toContain("Soll: 1 : 3");
    expect(container.textContent).toContain("nicht auf die 500 Behandlungsstunden angerechnet");
  });

  it("nennt persönlich festgelegte Ausbildungsregeln, sonst nichts", () => {
    const persoenlich = resolveRegelwerk({
      instanz: null,
      abweichungen: { ...KEINE_ABWEICHUNGEN, behandlungsstundenZiel: 500, verhaeltnisWarnung: 3.5, verhaeltnisKritisch: 4.5 },
      ebmStaffeln: [],
    });
    const { container, unmount } = render(<NachweisDocument nachweis={buildNachweis(sampleUserData(), Q1, persoenlich, NOW)} />);
    expect(container.querySelector("[data-regeln-persoenlich]")?.textContent).toBe(
      "Es gelten persönlich festgelegte Ausbildungsregeln: Ziel Behandlungsstunden 500, Soll-Verhältnis 1 : 3,5, Kritisch ab 1 : 4,5."
    );
    unmount();
    const nurInstanz = resolveRegelwerk({ instanz: { ...STANDARD.regeln, behandlungsstundenZiel: 500 }, abweichungen: null, ebmStaffeln: [] });
    const zweites = render(<NachweisDocument nachweis={buildNachweis(sampleUserData(), Q1, nurInstanz, NOW)} />);
    expect(zweites.container.querySelector("[data-regeln-persoenlich]")).toBeNull();
  });
});
