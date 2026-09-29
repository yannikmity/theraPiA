import { createRef } from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "../ui/button";

describe("Button", () => {
  it("rendert die Variante success mit den Theme-Klassen", () => {
    render(<Button variant="success">Speichern</Button>);
    const button = screen.getByRole("button", { name: "Speichern" });
    expect(button.className).toContain("bg-success");
    expect(button.className).toContain("text-success-foreground");
  });

  it("ist im Ladezustand deaktiviert und zeigt einen Spinner", () => {
    const { container } = render(<Button loading>Speichern</Button>);
    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector("svg.animate-spin")).not.toBeNull();
  });

  it("reicht ref und type durch (ConfirmButton fokussiert Bestätigen per ref)", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} type="submit">
        Ok
      </Button>
    );
    expect(ref.current?.getAttribute("type")).toBe("submit");
  });
});
