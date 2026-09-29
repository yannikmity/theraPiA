import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

// Ohne maximum-scale zoomt iOS beim Antippen jedes Felds mit weniger als 16 px Schrift hinein (#56). Deshalb am Handy
// text-base (16 px), erst ab md text-sm – für alle drei Feldarten gleich.
describe("Formularfelder", () => {
  it("haben am Handy 16 px Schrift und erst ab md 14 px", () => {
    render(
      <>
        <Input aria-label="Feld" />
        <Textarea aria-label="Text" />
        <NativeSelect aria-label="Auswahl">
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      </>
    );
    for (const name of ["Feld", "Text", "Auswahl"]) {
      const classes = screen.getByLabelText(name).className.split(/\s+/);
      expect(classes, name).toContain("text-base");
      expect(classes, name).toContain("md:text-sm");
      expect(classes, name).not.toContain("text-sm");
    }
  });
});
