import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ForgotForm } from "../../app/(auth)/auth/forgot/ForgotForm";

const email = () => screen.getByLabelText("E-Mail") as HTMLInputElement;
const submit = () => screen.getByRole("button", { name: "Link anfordern" });

describe("ForgotForm", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("zeigt ohne Mailversand nur den Hinweis an die Betreiber:in", () => {
    render(<ForgotForm mailEnabled={false} />);
    expect(screen.getByText(/Betreiber:in dieser Instanz/)).toBeTruthy();
    expect(screen.queryByLabelText("E-Mail")).toBeNull();
    expect(screen.getByRole("link", { name: "Zur Anmeldung" }).getAttribute("href")).toBe("/auth/login");
  });

  it("schickt die Adresse und zeigt danach die neutrale Bestätigung statt des Formulars", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: "Falls ein Konto mit dieser Adresse existiert, ist eine Mail unterwegs." }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ForgotForm mailEnabled />);
    fireEvent.change(email(), { target: { value: "pia@example.com" } });
    fireEvent.click(submit());
    expect(await screen.findByText(/ist eine Mail unterwegs/)).toBeTruthy();
    expect(screen.queryByLabelText("E-Mail")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/forgot",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "pia@example.com" }) })
    );
  });

  it("zeigt eine Fehlermeldung des Servers und lässt das Formular stehen", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Zu viele Versuche. Bitte später erneut versuchen." }), { status: 429 })));
    render(<ForgotForm mailEnabled />);
    fireEvent.change(email(), { target: { value: "pia@example.com" } });
    fireEvent.click(submit());
    expect((await screen.findByRole("alert")).textContent).toContain("Zu viele Versuche");
    expect(email()).toBeTruthy();
  });

  it("meldet einen Netzfehler", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    render(<ForgotForm mailEnabled />);
    fireEvent.change(email(), { target: { value: "pia@example.com" } });
    fireEvent.click(submit());
    expect((await screen.findByRole("alert")).textContent).toContain("Ein Fehler ist aufgetreten");
  });
});
