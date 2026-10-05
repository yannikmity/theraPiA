import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SupervisionStatusCard } from "../dashboard/SupervisionStatusCard";
import { calculateRatio } from "../../lib/calculations";
import { standardRegelwerk } from "../../lib/ausbildungsregeln/resolve";

const R = standardRegelwerk().regeln;

describe("SupervisionStatusCard", () => {
  it("nennt Stand, Rest, Verhältnis, fehlende Supervision und offene Sitzungen", () => {
    render(<SupervisionStatusCard therapyHours={40} supervisionHours={5} ratio={calculateRatio(40, 5, R)} regeln={R} unsupervisedCount={7} bySetting={{ einzel: 0, gruppe: 0 }} />);
    const region = screen.getByRole("region", { name: "Supervision" });
    expect(screen.getByRole("progressbar", { name: "SV-Einheiten" }).getAttribute("aria-valuemax")).toBe("150");
    expect(region.textContent).toContain("Noch 145,0 SV-Einheiten bis 150");
    expect(screen.getByText("Für 1:4 fehlen jetzt 5,0 SV-Einheiten.")).toBeDefined();
    expect(region.textContent).toContain("Supervision fehlt"); // RatioIndicator: critical (1:8)
    expect(region.textContent).toContain("Offene Supervision: 7 Sitzungen noch nicht besprochen");
    expect(screen.getByRole("link", { name: /Supervision erfassen/ }).getAttribute("href")).toBe("/sessions/new?type=supervision");
  });

  it("meldet ein passendes Verhältnis, Einzahl bei einer Sitzung und den leeren Anfang", () => {
    render(<SupervisionStatusCard therapyHours={40} supervisionHours={10} ratio={calculateRatio(40, 10, R)} regeln={R} unsupervisedCount={1} bySetting={{ einzel: 0, gruppe: 0 }} />);
    expect(screen.getByText("Verhältnis passt – im Soll von 1:4.")).toBeDefined();
    expect(screen.getByRole("region", { name: "Supervision" }).textContent).toContain("1 Sitzung noch nicht besprochen");
    render(<SupervisionStatusCard therapyHours={0} supervisionHours={0} ratio={calculateRatio(0, 0, R)} regeln={R} unsupervisedCount={0} bySetting={{ einzel: 0, gruppe: 0 }} />);
    expect(screen.getByText("Noch keine Behandlungsstunden erfasst.")).toBeDefined();
  });

  it("zeigt ohne Behandlungsstunden nie „0,0 fehlen“", () => {
    render(<SupervisionStatusCard therapyHours={0} supervisionHours={0} ratio={calculateRatio(0, 0, R)} regeln={R} unsupervisedCount={0} bySetting={{ einzel: 0, gruppe: 0 }} />);
    const text = screen.getByRole("region", { name: "Supervision" }).textContent;
    expect(text).toContain("Noch keine Behandlungsstunden erfasst.");
    expect(text).not.toContain("fehlen jetzt");
    expect(text).not.toContain("Verhältnis passt");
  });

  it("nutzt Ziel und Soll-Verhältnis aus dem Regelwerk", () => {
    const regeln = { ...R, svEinheitenZiel: 120, verhaeltnisWarnung: 3.5, verhaeltnisKritisch: 4.5 };
    render(<SupervisionStatusCard therapyHours={40} supervisionHours={10} ratio={calculateRatio(40, 10, regeln)} regeln={regeln} unsupervisedCount={0} bySetting={{ einzel: 0, gruppe: 0 }} />);
    const region = screen.getByRole("region", { name: "Supervision" });
    expect(screen.getByRole("progressbar", { name: "SV-Einheiten" }).getAttribute("aria-valuemax")).toBe("120");
    expect(region.textContent).toContain("Noch 110,0 SV-Einheiten bis 120");
    expect(screen.getByText("Für 1:3,5 fehlen jetzt 1,5 SV-Einheiten.")).toBeDefined();
    expect(region.textContent).toContain("(Soll: 1:3,5)");
  });

  // Bei ca. 190 px Kartenbreite (Querformat mit Safe-Area) darf der Knopf nicht über den Kartenrand ragen: er bleibt
  // in der Kartenbreite und bricht den Text um, statt die Höhe fest zu halten (Handy mindestens 44 px, Desktop 36 px).
  it("hält den Knopf „Supervision erfassen“ in schmalen Karten innerhalb der Karte", () => {
    render(<SupervisionStatusCard therapyHours={40} supervisionHours={5} ratio={calculateRatio(40, 5, R)} regeln={R} unsupervisedCount={7} bySetting={{ einzel: 0, gruppe: 0 }} />);
    const classes = screen.getByRole("link", { name: /Supervision erfassen/ }).className.split(" ");
    for (const c of ["max-w-full", "whitespace-normal", "h-auto", "min-h-11", "md:min-h-9"]) expect(classes, c).toContain(c);
    expect(classes).not.toContain("whitespace-nowrap");
  });

  it("zeigt SV-Einheiten getrennt nach Einzel und Gruppe mit Anteil", () => {
    render(<SupervisionStatusCard therapyHours={40} supervisionHours={10} ratio={calculateRatio(40, 10, R)} regeln={R} unsupervisedCount={0} bySetting={{ einzel: 7.5, gruppe: 2.5 }} />);
    const text = screen.getByRole("region", { name: "Supervision" }).textContent;
    expect(text).toContain("Einzel 7,5 (75 %)");
    expect(text).toContain("Gruppe 2,5 (25 %)");
  });

  it("zeigt ohne Supervision keine Prozentangaben", () => {
    render(<SupervisionStatusCard therapyHours={0} supervisionHours={0} ratio={calculateRatio(0, 0, R)} regeln={R} unsupervisedCount={0} bySetting={{ einzel: 0, gruppe: 0 }} />);
    // Der Fortschrittsbalken zeigt „(0%)“ – gemeint ist nur die Aufteilung nach Einzel und Gruppe.
    const text = screen.getByRole("region", { name: "Supervision" }).textContent;
    expect(text).not.toContain(" %)");
    expect(text).not.toContain("Einzel");
  });
});
