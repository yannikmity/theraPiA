import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConfirmButton } from "../ui/ConfirmButton";

describe("ConfirmButton", () => {
  it("fragt nach, bevor onConfirm läuft", () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Löschen" question="Wirklich löschen?" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText("Wirklich löschen?")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Ja, löschen" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("zeigt die Folgen und setzt den Fokus auf die Bestätigung", () => {
    render(
      <ConfirmButton
        label="Löschen"
        question="Sitzung löschen?"
        description="Die Zuordnung zur Supervision wird entfernt."
        onConfirm={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));

    expect(screen.getByText("Die Zuordnung zur Supervision wird entfernt.")).toBeDefined();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Ja, löschen" }));
  });

  it("Abbrechen und Escape verwerfen die Nachfrage", () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Löschen" question="Wirklich löschen?" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByText("Wirklich löschen?")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    fireEvent.keyDown(screen.getByRole("group"), { key: "Escape" });
    expect(screen.queryByText("Wirklich löschen?")).toBeNull();

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("schließt die Nachfrage auch, wenn onConfirm fehlschlägt", async () => {
    // Bei einem Fehler soll die Nachfrage nicht offen stehen bleiben; der Fehler selbst wird weitergereicht.
    const failure = new Error("Serverfehler");
    const onConfirm = vi.fn(() => Promise.reject(failure));
    const swallow = (reason: unknown) => {
      if (reason !== failure) throw reason;
    };
    process.on("unhandledRejection", swallow);
    try {
      render(<ConfirmButton label="Löschen" question="Wirklich löschen?" onConfirm={onConfirm} />);

      fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
      fireEvent.click(screen.getByRole("button", { name: "Ja, löschen" }));

      await waitFor(() => expect(screen.queryByText("Wirklich löschen?")).toBeNull());
      expect(onConfirm).toHaveBeenCalledTimes(1);
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      process.off("unhandledRejection", swallow);
    }
  });

  it("nutzt ariaLabel als Namen für einen reinen Icon-Auslöser", () => {
    render(<ConfirmButton ariaLabel="Sitzung löschen" label={<svg />} question="Löschen?" onConfirm={() => {}} />);

    expect(screen.getByRole("button", { name: "Sitzung löschen" })).toBeDefined();
  });
});
