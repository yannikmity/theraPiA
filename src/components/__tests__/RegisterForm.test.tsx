import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { RegisterForm } from "../../app/(auth)/auth/register/RegisterForm";

const base = { inviteToken: null, registrationOpen: true, closedMode: false, isSetup: true };

function fillAccount() {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Admin" } });
  fireEvent.change(screen.getByLabelText("E-Mail"), { target: { value: "admin@example.com" } });
  fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "sicheres-passwort" } });
  fireEvent.change(screen.getByLabelText("Passwort bestätigen"), { target: { value: "sicheres-passwort" } });
}

describe("RegisterForm: Einrichtung", () => {
  beforeEach(() => push.mockClear());
  afterEach(() => vi.unstubAllGlobals());

  it("fragt bei der Einrichtung den Einrichtungscode ab und sendet ihn mit", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(<RegisterForm {...base} setup="code-required" />);
    fillAccount();
    const code = screen.getByLabelText("Einrichtungscode") as HTMLInputElement;
    expect(code.required).toBe(true);
    fireEvent.change(code, { target: { value: "einrichtung-0123456789" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrieren" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/auth/login?registered=true"));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ setupToken: "einrichtung-0123456789" });
  });

  it("zeigt ohne SETUP_TOKEN auf einer öffentlichen Instanz nur den Hinweis, kein Formular", () => {
    render(<RegisterForm {...base} setup="blocked" />);
    expect(screen.getByText(/SETUP_TOKEN/)).toBeTruthy();
    expect(screen.queryByLabelText("E-Mail")).toBeNull();
  });

  it("zeigt ohne Einrichtung kein Codefeld", () => {
    render(<RegisterForm {...base} isSetup={false} setup="open" />);
    expect(screen.queryByLabelText("Einrichtungscode")).toBeNull();
  });
});
