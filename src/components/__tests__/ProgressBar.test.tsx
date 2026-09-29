import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ProgressBar from "../ProgressBar";

describe("ProgressBar", () => {
  it("renders label and values", () => {
    render(<ProgressBar current={30} target={100} label="Therapiestunden" />);
    expect(screen.getByText("Therapiestunden")).toBeDefined();
    expect(screen.getByText("30,0")).toBeDefined();
    expect(screen.getByText("/ 100")).toBeDefined();
  });

  it("calculates percentage correctly", () => {
    render(<ProgressBar current={50} target={200} label="Test" />);
    expect(screen.getByText("(25%)")).toBeDefined();
  });

  it("caps percentage at 100%", () => {
    render(<ProgressBar current={150} target={100} label="Test" />);
    expect(screen.getByText("(100%)")).toBeDefined();
  });

  it("uses the primary token by default", () => {
    const { container } = render(<ProgressBar current={50} target={100} label="Test" />);
    expect(container.querySelector(".bg-primary")).not.toBeNull();
    expect(container.querySelector(".bg-primary-soft")).not.toBeNull();
  });

  it("uses the success token when green", () => {
    const { container } = render(<ProgressBar current={50} target={100} label="Test" color="green" />);
    expect(container.querySelector(".bg-success")).not.toBeNull();
    expect(container.querySelector(".bg-success-soft")).not.toBeNull();
  });

  // Schmale Karten (Querformat mit seitlichen Safe-Areas, #56): Label und Wert brauchen Abstand und dürfen umbrechen,
  // der Wert wird dabei nicht zusammengedrückt.
  it("hält Label und Wert bei schmaler Breite auseinander", () => {
    render(<ProgressBar current={24} target={600} label="Behandlungsstunden" />);
    const label = screen.getByText("Behandlungsstunden");
    const head = label.parentElement!.className.split(" ");
    expect(head).toContain("flex-wrap");
    expect(head).toContain("gap-x-2");
    expect(label.className.split(" ")).toContain("min-w-0");
    const value = screen.getByText("24,0").parentElement!.className.split(" ");
    expect(value).toContain("shrink-0");
    expect(value).toContain("whitespace-nowrap");
  });
});
