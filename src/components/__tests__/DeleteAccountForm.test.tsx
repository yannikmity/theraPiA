import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("next-auth/react", () => ({ signOut }));
vi.mock("../../lib/actions/account", () => ({ deleteOwnAccountAction: vi.fn() }));
vi.mock("../../lib/analytics/track", () => ({ track: vi.fn() }));

import { DeleteAccountForm } from "../../app/(app)/profile/data/DeleteAccountForm";
import { deleteOwnAccountAction } from "../../lib/actions/account";
import { track } from "../../lib/analytics/track";

const action = vi.mocked(deleteOwnAccountAction);
const trigger = () => screen.getByRole("button", { name: "Account endgültig löschen" }) as HTMLButtonElement;
const password = () => screen.getByLabelText("Passwort zur Bestätigung") as HTMLInputElement;

async function armAndConfirm(value = "sicheres-passwort") {
  fireEvent.change(password(), { target: { value } });
  fireEvent.click(trigger());
  fireEvent.click(screen.getByRole("button", { name: "Ja, Account löschen" }));
}

describe("DeleteAccountForm", () => {
  beforeEach(() => {
    action.mockReset();
    signOut.mockReset();
    vi.mocked(track).mockReset();
  });

  it("erklärt die Folgen, empfiehlt den Export und sperrt den Knopf ohne Passwort", () => {
    render(<DeleteAccountForm isAdmin={false} />);
    expect(screen.getByText(/nicht rückgängig/)).toBeDefined();
    expect(screen.getByText(/Vorher exportieren/)).toBeDefined();
    expect(screen.queryByText(/letzte aktive Admin/)).toBeNull();
    expect(trigger().disabled).toBe(true);
    fireEvent.change(password(), { target: { value: "x" } });
    expect(trigger().disabled).toBe(false);
    fireEvent.click(trigger());
    expect(screen.getByText("Account wirklich löschen?")).toBeDefined();
    expect(action).not.toHaveBeenCalled();
  });

  it("zeigt Admins den Hinweis auf den letzten Admin vorab", () => {
    render(<DeleteAccountForm isAdmin />);
    expect(screen.getByText(/letzte aktive Admin/)).toBeDefined();
  });

  it("zeigt die Meldung des Servers, leert das Passwort und meldet nicht ab", async () => {
    action.mockResolvedValue({ success: false, error: "Das Passwort ist falsch." });
    render(<DeleteAccountForm isAdmin={false} />);
    await armAndConfirm("falsch");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Das Passwort ist falsch."));
    expect(action).toHaveBeenCalledWith({ password: "falsch" });
    expect(password().value).toBe("");
    expect(signOut).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it("meldet nach dem Löschen ab und leitet mit Hinweis zum Login", async () => {
    action.mockResolvedValue({ success: true, data: undefined });
    render(<DeleteAccountForm isAdmin={false} />);
    await armAndConfirm();
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/auth/login?accountDeleted=true" }));
    expect(track).toHaveBeenCalledWith("account_deleted");
  });

  it("leitet auch dann zum Login weiter, wenn signOut fehlschlägt", async () => {
    action.mockResolvedValue({ success: true, data: undefined });
    signOut.mockRejectedValue(new Error("Netz"));
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    try {
      render(<DeleteAccountForm isAdmin={false} />);
      await armAndConfirm();
      await waitFor(() => expect(assign).toHaveBeenCalledWith("/auth/login?accountDeleted=true"));
      expect(track).toHaveBeenCalledWith("account_deleted");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("ruft die Action nicht auf, wenn das Passwort bei offener Nachfrage geleert wurde", async () => {
    render(<DeleteAccountForm isAdmin={false} />);
    fireEvent.change(password(), { target: { value: "sicheres-passwort" } });
    fireEvent.click(trigger());
    fireEvent.change(password(), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Ja, Account löschen" }));
    await waitFor(() => expect(trigger()).toBeDefined());
    expect(action).not.toHaveBeenCalled();
    expect(password().disabled).toBe(false);
  });

  it("fängt einen abgelehnten Aufruf mit der allgemeinen Meldung ab", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    action.mockRejectedValue(new Error("Netz"));
    render(<DeleteAccountForm isAdmin={false} />);
    await armAndConfirm();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Ein unerwarteter Fehler ist aufgetreten"));
    expect(signOut).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith("Server-Action fehlgeschlagen:", expect.any(Error));
    logged.mockRestore();
  });

  it("verknüpft die Fehlermeldung mit dem Passwortfeld (aria-describedby, aria-invalid)", async () => {
    action.mockResolvedValue({ success: false, error: "Das Passwort ist falsch." });
    render(<DeleteAccountForm isAdmin={false} />);
    expect(password().getAttribute("aria-describedby")).toBeNull();
    await armAndConfirm("falsch");
    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
    expect(screen.getByRole("alert").id).toBe("delete-error");
    expect(password().getAttribute("aria-describedby")).toBe("delete-error");
    expect(password().getAttribute("aria-invalid")).toBe("true");
  });
});
