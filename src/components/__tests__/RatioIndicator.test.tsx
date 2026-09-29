import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RatioIndicator from "../RatioIndicator";
import { RatioResult } from "@/lib/calculations";

function makeRatio(overrides: Partial<RatioResult> = {}): RatioResult {
  return {
    therapyHours: 10,
    supervisionHours: 2.5,
    ratio: 4,
    isOk: true,
    status: "ok",
    soll: 4,
    ...overrides,
  };
}

describe("RatioIndicator", () => {
  it("renders ok status correctly", () => {
    render(<RatioIndicator ratio={makeRatio({ status: "ok" })} />);
    expect(screen.getByText("Passt")).toBeDefined();
  });

  it("renders warning status correctly", () => {
    render(
      <RatioIndicator ratio={makeRatio({ status: "warning", ratio: 4.5, isOk: false })} />
    );
    expect(screen.getByText("Knapp")).toBeDefined();
  });

  it("renders critical status correctly", () => {
    render(
      <RatioIndicator ratio={makeRatio({ status: "critical", ratio: 6, isOk: false })} />
    );
    expect(screen.getByText("Supervision fehlt")).toBeDefined();
  });

  it("renders compact mode with ratio", () => {
    render(<RatioIndicator ratio={makeRatio({ ratio: 3.5 })} compact />);
    expect(screen.getByText("1:3,5")).toBeDefined();
  });

  it("shows ? for Infinity ratio in compact mode", () => {
    render(<RatioIndicator ratio={makeRatio({ ratio: Infinity })} compact />);
    expect(screen.getByText("1:?")).toBeDefined();
  });

  it("shows full description in non-compact mode", () => {
    render(
      <RatioIndicator
        ratio={makeRatio({ supervisionHours: 2.5, therapyHours: 10, ratio: 4 })}
      />
    );
    expect(
      screen.getByText("2,5 SV-Einheiten / 10,0 Behandlungsstunden (Soll: 1:4)")
    ).toBeDefined();
  });

  it("zeigt das Soll-Verhältnis aus dem Ergebnis", () => {
    render(<RatioIndicator ratio={makeRatio({ soll: 3.5 })} />);
    expect(screen.getByText(/\(Soll: 1:3,5\)/)).toBeDefined();
  });

  // In schmalen Karten (#56) schrumpfte das Status-Icon im Flex-Container auf 0 px. Icon shrink-0, Textblock min-w-0,
  // Verhältnis und Badge dürfen umbrechen, der Wert „1 : 5,0“ bleibt zusammen.
  it("hält das Status-Icon sichtbar und das Verhältnis zusammen", () => {
    const { container } = render(<RatioIndicator ratio={makeRatio({ status: "warning", ratio: 5, isOk: false })} />);
    const icon = container.querySelector("svg")!;
    expect(icon.getAttribute("class")!.split(" ")).toContain("shrink-0");
    expect((icon.nextElementSibling as HTMLElement).className.split(" ")).toContain("min-w-0");
    const ratioValue = screen.getByText("1 : 5,0");
    expect(ratioValue.className.split(" ")).toContain("whitespace-nowrap");
    expect(ratioValue.parentElement!.textContent).toBe("Verhältnis: 1 : 5,0");
    expect(ratioValue.parentElement!.parentElement!.className.split(" ")).toContain("flex-wrap");
    // „Behandlungsstunden“ in der Erläuterung ist bei ca. 200 px Kartenbreite breiter als die Textspalte.
    expect(screen.getByText(/SV-Einheiten \//).className.split(" ")).toContain("hyphens-auto");
  });
});
