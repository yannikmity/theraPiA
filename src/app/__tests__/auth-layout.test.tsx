import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import AuthLayout from "../(auth)/layout";

describe("Auth-Layout", () => {
  it("hält Statusleiste, Home-Indikator und seitliche Notch frei (viewport-fit=cover gilt auch hier)", () => {
    const { container } = render(
      <AuthLayout>
        <p>Formular</p>
      </AuthLayout>
    );
    const classes = (container.firstElementChild as HTMLElement).className.split(/\s+/);
    expect(classes).toEqual(
      expect.arrayContaining([
        "pt-[max(3rem,env(safe-area-inset-top))]",
        "pb-[max(3rem,env(safe-area-inset-bottom))]",
        "pl-[max(1rem,env(safe-area-inset-left))]",
        "pr-[max(1rem,env(safe-area-inset-right))]",
      ])
    );
    expect(classes).not.toContain("py-12");
    expect(classes).not.toContain("px-4");
  });
});
