import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { ResetForm } from "../../app/(auth)/auth/reset/ResetForm";
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from "@/lib/constants";

const password = () => screen.getByLabelText("Neues Passwort") as HTMLInputElement;
const confirm = () => screen.getByLabelText("Passwort wiederholen") as HTMLInputElement;
const submitButton = () => screen.getByRole("button", { name: "Passwort speichern" });
const fill = (a: string, b: string) => {
  fireEvent.change(password(), { target: { value: a } });
  fireEvent.change(confirm(), { target: { value: b } });
};

describe("ResetForm", () => {
  beforeEach(() => push.mockClear());
  afterEach(() => vi.unstubAllGlobals());

  it("verknüpft die Meldung bei ungleichen Passwörtern mit beiden Feldern und fokussiert die Wiederholung", () => {
    const { container } = render(<ResetForm token="beispiel" />);
    expect(container.querySelector("form")!.noValidate).toBe(true);
    fill("sicheres-passwort-1", "sicheres-passwort-2");
    fireEvent.click(submitButton());
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Passwörter stimmen nicht überein");
    expect(alert.id).not.toBe("");
    expect(password().getAttribute("aria-describedby")).toBe(alert.id);
    expect(confirm().getAttribute("aria-describedby")).toBe(alert.id);
    expect(confirm().getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(confirm());
  });

  it("fokussiert bei zu kurzem Passwort das erste Feld – auch beim zweiten Versuch mit derselben Meldung", () => {
    render(<ResetForm token="beispiel" />);
    fill("kurz", "kurz");
    fireEvent.click(submitButton());
    expect(screen.getByRole("alert").textContent).toContain(`mindestens ${MIN_PASSWORD_LENGTH} Zeichen`);
    expect(document.activeElement).toBe(password());
    expect(password().getAttribute("aria-invalid")).toBe("true");
    submitButton().focus();
    fireEvent.click(submitButton());
    expect(document.activeElement).toBe(password());
  });

  // Server-, Token- und Netzfehler betreffen kein Feld: kein aria-invalid, der Fokus geht auf die Meldung selbst (#15).
  it("lehnt ein Passwort über 72 Byte ab, ohne den Server zu fragen (#48)", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ResetForm token="beispiel" />);
    const tooLong = "ü".repeat(MAX_PASSWORD_BYTES / 2) + "x";
    fill(tooLong, tooLong);
    fireEvent.click(submitButton());
    expect(screen.getByRole("alert").textContent).toContain(`höchstens ${MAX_PASSWORD_BYTES} Byte`);
    expect(password().getAttribute("aria-invalid")).toBe("true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verknüpft eine Meldung des Servers mit beiden Feldern, markiert kein Feld als ungültig und fokussiert die Meldung", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Link ungültig oder abgelaufen" }), { status: 400 })));
    render(<ResetForm token="beispiel" />);
    fill("sicheres-passwort-1", "sicheres-passwort-1");
    fireEvent.click(submitButton());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Link ungültig oder abgelaufen");
    expect(password().getAttribute("aria-describedby")).toBe(alert.id);
    expect(confirm().getAttribute("aria-describedby")).toBe(alert.id);
    expect(password().hasAttribute("aria-invalid")).toBe(false);
    expect(confirm().hasAttribute("aria-invalid")).toBe(false);
    // Der Fokus kommt aus einem Effekt nach dem Rendern der Meldung – darauf warten statt sofort prüfen.
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(push).not.toHaveBeenCalled();
  });

  it("behandelt einen Netzfehler wie eine Server-Meldung: Fokus auf die Meldung, kein Feld ungültig", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Netz weg"))));
    render(<ResetForm token="beispiel" />);
    fill("sicheres-passwort-1", "sicheres-passwort-1");
    fireEvent.click(submitButton());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Ein Fehler ist aufgetreten");
    expect(password().getAttribute("aria-describedby")).toBe(alert.id);
    expect(password().hasAttribute("aria-invalid")).toBe(false);
    expect(confirm().hasAttribute("aria-invalid")).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(push).not.toHaveBeenCalled();
  });

  it("verweist bei unvollständigem Link auf das erneute Anfordern", () => {
    render(<ResetForm token="" />);
    expect(screen.getByRole("link", { name: "Neuen Link anfordern" }).getAttribute("href")).toBe("/auth/forgot");
  });
});
