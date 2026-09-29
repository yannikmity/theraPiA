import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("../../app/(app)/admin/actions", () => ({
  createInvitationAction: vi.fn(),
  revokeInvitationAction: vi.fn(),
  createResetLinkAction: vi.fn(),
  setUserDisabledAction: vi.fn(),
}));

import { AdminClient } from "../../app/(app)/admin/AdminClient";
import { createInvitationAction, createResetLinkAction, revokeInvitationAction, type AdminData } from "../../app/(app)/admin/actions";

const ME = "550e8400-e29b-41d4-a716-446655440001";
const OTHER = "550e8400-e29b-41d4-a716-446655440002";
const INV = "550e8400-e29b-41d4-a716-446655440011";
const data: AdminData = {
  users: [
    { id: ME, email: "admin@example.com", name: "PiA Admin", role: "admin", createdAt: "2026-01-01T08:00:00.000Z", disabled: false, demo: false },
    { id: OTHER, email: "pia@example.com", name: "PiA Zwei", role: "pia", createdAt: "2026-02-01T08:00:00.000Z", disabled: false, demo: false },
  ],
  invitations: [{ id: INV, email: "neu@example.com", role: "pia", expiresAt: "2099-01-01T00:00:00.000Z", withDemoData: false }],
};
type InviteResult = Awaited<ReturnType<typeof createInvitationAction>>;

describe("AdminClient", () => {
  beforeEach(() => {
    vi.mocked(createInvitationAction).mockReset();
    vi.mocked(revokeInvitationAction).mockReset();
    vi.mocked(createResetLinkAction).mockReset();
  });

  it("erzeugt bei Doppelklick nur eine Einladung und sperrt währenddessen die anderen Knöpfe", async () => {
    let finish: (value: InviteResult) => void = () => {};
    vi.mocked(createInvitationAction).mockImplementation(() => new Promise<InviteResult>((resolve) => (finish = resolve)));
    render(<AdminClient initialData={data} currentUserId={ME} />);
    const submit = screen.getByRole("button", { name: "Einladungslink erzeugen" }) as HTMLButtonElement;
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(createInvitationAction).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(submit.disabled).toBe(true));
    expect((screen.getByRole("button", { name: "Widerrufen" }) as HTMLButtonElement).disabled).toBe(true);
    finish({ success: true, data: { link: "http://localhost/auth/register?invite=abc", data } });
    await waitFor(() => expect(screen.getByText("Einladungslink (14 Tage gültig)")).toBeDefined());
    expect(submit.disabled).toBe(false);
  });

  it("zeigt den Feldfehler der E-Mail unter dem Feld und verknüpft ihn – ohne allgemeine Meldung", async () => {
    vi.mocked(createInvitationAction).mockResolvedValue({ success: false, error: "Ungültige Eingabe", fieldErrors: { email: ["Ungültige E-Mail-Adresse"] } });
    render(<AdminClient initialData={data} currentUserId={ME} />);
    const email = screen.getByLabelText(/E-Mail \(optional/) as HTMLInputElement;
    expect(email.form!.noValidate).toBe(true);
    fireEvent.change(email, { target: { value: "keine-adresse" } });
    fireEvent.click(screen.getByRole("button", { name: "Einladungslink erzeugen" }));
    const message = await screen.findByText("Ungültige E-Mail-Adresse");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(email.getAttribute("aria-describedby")).toBe(message.id);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("setzt nach dem Feldfehler der E-Mail den Fokus zurück ins Feld", async () => {
    vi.mocked(createInvitationAction).mockResolvedValue({ success: false, error: "Ungültige Eingabe", fieldErrors: { email: ["Ungültige E-Mail-Adresse"] } });
    render(<AdminClient initialData={data} currentUserId={ME} />);
    const email = screen.getByLabelText(/E-Mail \(optional/) as HTMLInputElement;
    fireEvent.change(email, { target: { value: "keine-adresse" } });
    fireEvent.click(screen.getByRole("button", { name: "Einladungslink erzeugen" }));
    await screen.findByText("Ungültige E-Mail-Adresse");
    await waitFor(() => expect(document.activeElement).toBe(email));
    expect(email.disabled).toBe(false);
  });

  it("fängt einen abgelehnten Aufruf (Netz weg) beim Widerrufen ab und zeigt die Meldung in der Zeile", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(revokeInvitationAction).mockRejectedValue(new TypeError("Failed to fetch"));
    render(<AdminClient initialData={data} currentUserId={ME} />);
    fireEvent.click(screen.getByRole("button", { name: "Widerrufen" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Ein unerwarteter Fehler ist aufgetreten"));
    const row = screen.getByText(/neu@example.com/).parentElement as HTMLElement;
    expect(within(row).getByRole("alert")).toBeDefined();
    expect(logged).toHaveBeenCalledWith("Server-Action fehlgeschlagen:", expect.any(TypeError));
    logged.mockRestore();
  });

  it("meldet, wenn die Zwischenablage nicht verfügbar ist, und lässt den Link markierbar", async () => {
    vi.mocked(createResetLinkAction).mockResolvedValue({ success: true, data: { link: "http://localhost/auth/reset?token=abc" } });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, configurable: true });
    render(<AdminClient initialData={data} currentUserId={ME} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Reset-Link" })[1]);
    const link = await screen.findByText("http://localhost/auth/reset?token=abc");
    expect(link.className).toContain("select-all");
    fireEvent.click(screen.getByRole("button", { name: "Link kopieren" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Kopieren nicht möglich"));
    expect(screen.getByText("Reset-Link für PiA Zwei (24 Stunden gültig)")).toBeDefined();
  });

  it("setzt den Kopierstatus zurück, wenn ein neuer Link den alten ersetzt", async () => {
    vi.mocked(createResetLinkAction)
      .mockResolvedValueOnce({ success: true, data: { link: "http://localhost/auth/reset?token=erster" } })
      .mockResolvedValueOnce({ success: true, data: { link: "http://localhost/auth/reset?token=zweiter" } });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
    render(<AdminClient initialData={data} currentUserId={ME} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Reset-Link" })[1]);
    await screen.findByText("http://localhost/auth/reset?token=erster");
    fireEvent.click(screen.getByRole("button", { name: "Link kopieren" }));
    await screen.findByRole("button", { name: "Kopiert" });
    fireEvent.click(screen.getAllByRole("button", { name: "Reset-Link" })[0]);
    await screen.findByText("http://localhost/auth/reset?token=zweiter");
    expect(screen.getByRole("button", { name: "Link kopieren" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Kopiert" })).toBeNull();
  });

  it("schickt ohne Häkchen withDemoData: false", async () => {
    vi.mocked(createInvitationAction).mockResolvedValue({ success: true, data: { link: "http://localhost/auth/register?invite=abc", data } });
    render(<AdminClient initialData={data} currentUserId={ME} />);
    fireEvent.click(screen.getByRole("button", { name: "Einladungslink erzeugen" }));
    await screen.findByText("Einladungslink (14 Tage gültig)");
    expect(createInvitationAction).toHaveBeenCalledWith({ email: null, role: "pia", withDemoData: false });
  });

  it("lädt mit Häkchen zu einem Demo-Zugang ein, beschriftet den Link und setzt das Häkchen zurück", async () => {
    vi.mocked(createInvitationAction).mockResolvedValue({ success: true, data: { link: "http://localhost/auth/register?invite=abc", data } });
    render(<AdminClient initialData={data} currentUserId={ME} />);
    const box = screen.getByRole("checkbox", { name: /Mit Beispieldaten starten/ });
    fireEvent.click(box);
    expect(box.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Einladungslink erzeugen" }));
    await screen.findByText("Demo-Einladungslink (14 Tage gültig, mit Beispieldaten)");
    expect(createInvitationAction).toHaveBeenCalledWith({ email: null, role: "pia", withDemoData: true });
    expect(screen.getByRole("checkbox", { name: /Mit Beispieldaten starten/ }).getAttribute("aria-checked")).toBe("false");
  });

  it("sperrt das Häkchen für die Rolle Administration und nimmt es dabei zurück", () => {
    render(<AdminClient initialData={data} currentUserId={ME} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Mit Beispieldaten starten/ }));
    fireEvent.change(screen.getByLabelText("Rolle"), { target: { value: "admin" } });
    const box = screen.getByRole("checkbox", { name: /Mit Beispieldaten starten/ }) as HTMLButtonElement;
    expect(box.getAttribute("aria-checked")).toBe("false");
    expect(box.disabled).toBe(true);
  });

  it("kennzeichnet Demo-Accounts und Einladungen mit Beispieldaten", () => {
    const DEMO = "550e8400-e29b-41d4-a716-446655440003";
    const mitDemo: AdminData = {
      users: [
        ...data.users,
        { id: DEMO, email: "demo@example.com", name: "PiA Demo", role: "pia", createdAt: "2026-03-01T08:00:00.000Z", disabled: false, demo: true },
      ],
      invitations: [{ ...data.invitations[0], withDemoData: true }],
    };
    render(<AdminClient initialData={mitDemo} currentUserId={ME} />);
    const badges = screen.getAllByText("Demo", { selector: '[data-slot="badge"]' });
    expect(badges).toHaveLength(1);
    expect(badges[0].closest("p")!.textContent).toContain("PiA Demo");
    expect(screen.getByText(/neu@example.com/).textContent).toContain("mit Beispieldaten");
  });
});
