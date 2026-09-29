import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AppError from "../(app)/error";

describe("Fehlerseite des App-Bereichs (error.tsx)", () => {
  it("zeigt eine Meldung mit Fehlerkennung, protokolliert den Fehler und versucht es auf Wunsch erneut", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    const error = Object.assign(new Error("kaputt"), { digest: "abc123" });
    render(<AppError error={error} retry={retry} />);
    expect(screen.getByRole("alert").textContent).toContain("Diese Seite konnte nicht geladen werden.");
    expect(screen.getByText("abc123")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith("Seitenfehler:", error);
    logged.mockRestore();
  });

  // retry() bekommt kein Klick-Ereignis als Argument; ohne digest steht keine leere „Fehlerkennung:“ da.
  it("zeigt ohne digest keine Fehlerkennung und ruft retry() ohne Argumente auf", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    const error = new Error("kaputt");
    render(<AppError error={error} retry={retry} />);
    expect(screen.getByRole("alert").textContent).toContain("Bitte gleich noch einmal versuchen.");
    expect(screen.getByRole("alert").textContent).not.toContain("Fehlerkennung");
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledWith();
    expect(logged).toHaveBeenCalledWith("Seitenfehler:", error);
    logged.mockRestore();
  });
});
