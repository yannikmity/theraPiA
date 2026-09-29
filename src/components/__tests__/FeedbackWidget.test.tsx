import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../feedback/capture", async () => {
  const actual = await vi.importActual<typeof import("../feedback/capture")>("../feedback/capture");
  return { ...actual, captureViewport: vi.fn(async () => "data:image/png;base64,AAAA") };
});

import { FeedbackWidget } from "../feedback/FeedbackWidget";
import { captureViewport } from "../feedback/capture";
import { FAB_CORNER, FAB_PANEL, FAB_RIGHT } from "../feedback/fab-zone";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderPage() {
  return render(
    <div>
      <main>
        <h1>Dashboard</h1>
        <button type="button">Erfassen</button>
      </main>
      <FeedbackWidget userName="PiA Beispiel" />
    </div>
  );
}

async function pinHeading() {
  fireEvent.click(screen.getByRole("button", { name: "Feedback geben" }));
  fireEvent.click(screen.getByText("Dashboard"));
  await waitFor(() => expect(screen.getByRole("dialog", { name: "Feedback geben" })).toBeDefined());
}

describe("FeedbackWidget", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse({ id: "20260926-120000-0123abcd", screenshot: true }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it("startet den Pick-Modus und bricht mit Escape ab", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Feedback geben" }));
    expect(screen.getByRole("group", { name: "Feedback-Auswahl" }).textContent).toContain("Element antippen");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Feedback-Auswahl" })).toBeNull();
    expect(screen.getByRole("button", { name: "Feedback geben" })).toBeDefined();
  });

  it("pinnt ein Element, zeigt Label, Seite und Person und speichert ohne Nutzerfelder im Payload", async () => {
    renderPage();
    await pinHeading();
    const dialog = screen.getByRole("dialog", { name: "Feedback geben" });
    expect(dialog.textContent).toContain("Dashboard");
    expect(dialog.textContent).toContain("als PiA Beispiel");
    await screen.findByAltText("Vorschau des Screenshots");

    const save = screen.getByRole("button", { name: "Direkt speichern" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Feedback-Text"), { target: { value: "Die Überschrift ist zu klein." } });
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Stört mich/ }));
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() => expect(screen.getByText("Danke, festgehalten.")).toBeDefined());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/feedback");
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      page: "/",
      element: "Dashboard",
      // Testing Library hängt einen Container-<div> an body; der Pfad endet jedenfalls mit main > h1.
      selector: expect.stringMatching(/main > h1$/),
      sentiment: "negativ",
      text: "Die Überschrift ist zu klein.",
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      screenshot: "data:image/png;base64,AAAA",
    });
    expect(Object.keys(body)).not.toContain("user");
  });

  it("schickt ohne Häkchen keinen Screenshot", async () => {
    renderPage();
    await pinHeading();
    await screen.findByAltText("Vorschau des Screenshots");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Feedback-Text"), { target: { value: "ok" } });
    fireEvent.click(screen.getByRole("radio", { name: /Gefällt mir/ }));
    fireEvent.click(screen.getByRole("button", { name: "Direkt speichern" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).screenshot).toBeNull();
  });

  it("zeigt einen Fehler, wenn der Server ablehnt, und behält die Eingabe", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Anfrage zu groß" }, 413));
    renderPage();
    await pinHeading();
    await screen.findByAltText("Vorschau des Screenshots");
    fireEvent.change(screen.getByLabelText("Feedback-Text"), { target: { value: "bleibt" } });
    fireEvent.click(screen.getByRole("radio", { name: /Wunsch/ }));
    fireEvent.click(screen.getByRole("button", { name: "Direkt speichern" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Anfrage zu groß"));
    expect((screen.getByLabelText("Feedback-Text") as HTMLTextAreaElement).value).toBe("bleibt");
  });

  it("markiert alle Teile mit data-feedback-widget und pinnt Klicks im Panel nicht erneut", async () => {
    renderPage();
    await pinHeading();
    const dialog = screen.getByRole("dialog", { name: "Feedback geben" });
    expect(dialog.hasAttribute("data-feedback-widget")).toBe(true);
    fireEvent.click(screen.getByLabelText("Feedback-Text"));
    expect(screen.getByRole("dialog", { name: "Feedback geben" }).textContent).toContain("Dashboard");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("pinnt mit Enter nicht den body, wenn nach dem Start kein Element fokussiert ist", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Feedback geben" }));
    expect(document.activeElement).toBe(screen.getByRole("group", { name: "Feedback-Auswahl" }));
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document, { key: "Enter" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("group", { name: "Feedback-Auswahl" }).textContent).toContain("Element antippen");
  });

  it("zeigt die Hinweisleiste unten über der Bottom-Navigation, nicht über Kopfzeile und Überschrift", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Feedback geben" }));
    const hint = screen.getByRole("group", { name: "Feedback-Auswahl" });
    const classes = hint.className.split(/\s+/);
    expect(classes.some((c) => /^(md:)?top-/.test(c))).toBe(false);
    expect(classes).toContain("bottom-[calc(4.5rem+env(safe-area-inset-bottom))]");
    // Kein role="status" auf einem Container mit Knöpfen – live ist nur der Hinweistext.
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Element antippen, zu dem du Feedback geben willst").getAttribute("aria-live")).toBe("polite");
  });

  it("verwirft einen Screenshot, der erst nach einem neuen Pin fertig wird", async () => {
    const resolvers: Array<(value: string | null) => void> = [];
    vi.mocked(captureViewport).mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    try {
      renderPage();
      await pinHeading();
      fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
      fireEvent.click(screen.getByRole("button", { name: "Feedback geben" }));
      fireEvent.click(screen.getByText("Erfassen"));
      await waitFor(() => expect(screen.getByRole("dialog").textContent).toContain("Erfassen"));
      expect(resolvers).toHaveLength(2);
      resolvers[1]("data:image/png;base64,NEU");
      await waitFor(() => expect(screen.getByAltText("Vorschau des Screenshots").getAttribute("src")).toBe("data:image/png;base64,NEU"));
      resolvers[0]("data:image/png;base64,ALT");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(screen.getByAltText("Vorschau des Screenshots").getAttribute("src")).toBe("data:image/png;base64,NEU");
    } finally {
      vi.mocked(captureViewport).mockImplementation(async () => "data:image/png;base64,AAAA");
    }
  });

  it("sperrt Speichern, solange der Screenshot noch aufgenommen wird", async () => {
    let finish: (value: string | null) => void = () => {};
    vi.mocked(captureViewport).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    renderPage();
    await pinHeading();
    fireEvent.change(screen.getByLabelText("Feedback-Text"), { target: { value: "gleich" } });
    fireEvent.click(screen.getByRole("radio", { name: /Wunsch/ }));
    const save = screen.getByRole("button", { name: "Direkt speichern" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    finish("data:image/png;base64,AAAA");
    await waitFor(() => expect(save.disabled).toBe(false));
  });

  it("„Ganze Seite“ pinnt main mit festem Label statt des Seitentexts", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Feedback geben" }));
    fireEvent.click(screen.getByRole("button", { name: "Ganze Seite" }));
    await screen.findByAltText("Vorschau des Screenshots");
    expect(screen.getByRole("dialog").textContent).toContain("zu: Ganze Seite");
    expect(screen.getByRole("dialog").textContent).not.toContain("DashboardErfassen");
    fireEvent.change(screen.getByLabelText("Feedback-Text"), { target: { value: "Seite" } });
    fireEvent.click(screen.getByRole("radio", { name: /Gefällt mir/ }));
    fireEvent.click(screen.getByRole("button", { name: "Direkt speichern" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.element).toBe("Ganze Seite");
    expect(body.selector).toMatch(/main$/);
  });

  it("lässt den Screenshot während der Aufnahme abwählen und dann ohne ihn speichern", async () => {
    vi.mocked(captureViewport).mockImplementationOnce(() => new Promise(() => {}));
    renderPage();
    await pinHeading();
    fireEvent.change(screen.getByLabelText("Feedback-Text"), { target: { value: "ohne Bild" } });
    fireEvent.click(screen.getByRole("radio", { name: /Stört mich/ }));
    const save = screen.getByRole("button", { name: "Direkt speichern" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    const checkbox = screen.getByRole("checkbox") as HTMLButtonElement;
    expect(checkbox.disabled).toBe(false);
    fireEvent.click(checkbox);
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByText("Danke, festgehalten.")).toBeDefined());
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).screenshot).toBeNull();
  });

  it("sperrt Abbrechen und Schließen während des Speicherns", async () => {
    let respond: (value: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (respond = resolve)));
    renderPage();
    await pinHeading();
    await screen.findByAltText("Vorschau des Screenshots");
    fireEvent.change(screen.getByLabelText("Feedback-Text"), { target: { value: "unterwegs" } });
    fireEvent.click(screen.getByRole("radio", { name: /Wunsch/ }));
    fireEvent.click(screen.getByRole("button", { name: "Direkt speichern" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Abbrechen" }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByRole("button", { name: "Schließen" }) as HTMLButtonElement).disabled).toBe(true);
    respond(jsonResponse({ id: "20260926-120000-0123abcd", screenshot: true }));
    await waitFor(() => expect(screen.getByText("Danke, festgehalten.")).toBeDefined());
    expect((screen.getByRole("button", { name: "Schließen" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("Knopf, Hinweisleiste und Panel sitzen in derselben Zone, die AppShell freihält", () => {
    renderPage();
    const fab = screen.getByRole("button", { name: "Feedback geben" });
    for (const cls of FAB_CORNER.split(" ")) expect(fab.className.split(/\s+/)).toContain(cls);
    for (const cls of FAB_RIGHT.split(" ")) expect(fab.className.split(/\s+/)).toContain(cls);
    expect(fab.className.split(/\s+/)).not.toContain("right-4");
  });

  it("Panel: seitlich innerhalb der Safe-Areas, Höhe abzüglich beider Safe-Areas – ragt nie oben aus dem Bild", async () => {
    renderPage();
    await pinHeading();
    const classes = screen.getByRole("dialog", { name: "Feedback geben" }).className.split(/\s+/);
    for (const cls of [...FAB_PANEL.split(" "), ...FAB_CORNER.split(" ")]) expect(classes).toContain(cls);
    expect(classes).not.toContain("inset-x-3");
    expect(classes).not.toContain("max-h-[calc(100svh-6rem)]");
    expect(FAB_PANEL).toContain("env(safe-area-inset-top)");
    expect(FAB_PANEL).toContain("env(safe-area-inset-bottom)");
  });

  it("schließt das Panel mit Escape auch ohne Fokus im Panel – nicht aber während des Speicherns", async () => {
    let respond: (value: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (respond = resolve)));
    renderPage();
    await pinHeading();
    await screen.findByAltText("Vorschau des Screenshots");
    fireEvent.change(screen.getByLabelText("Feedback-Text"), { target: { value: "bleibt offen" } });
    fireEvent.click(screen.getByRole("radio", { name: /Wunsch/ }));
    fireEvent.click(screen.getByRole("button", { name: "Direkt speichern" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Abbrechen" }) as HTMLButtonElement).disabled).toBe(true));
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Feedback geben" })).toBeDefined();
    respond(jsonResponse({ id: "20260926-120000-0123abcd", screenshot: true }));
    await waitFor(() => expect(screen.getByText("Danke, festgehalten.")).toBeDefined());
    (document.activeElement as HTMLElement | null)?.blur();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(false);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Feedback geben" })).toBeDefined();
  });

  it("verhindert im Pick-Modus pointerdown auf Seitenelementen (kein Dropdown, kein Fokuswechsel), nicht auf der Leiste", () => {
    render(
      <div>
        <main>
          <select aria-label="Status">
            <option>Geplant</option>
          </select>
        </main>
        <FeedbackWidget userName="PiA Beispiel" />
      </div>
    );
    const select = screen.getByLabelText("Status");
    expect(fireEvent.pointerDown(select)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Feedback geben" }));
    expect(fireEvent.pointerDown(select)).toBe(false);
    expect(fireEvent.pointerDown(screen.getByRole("button", { name: "Ganze Seite" }))).toBe(true);
    fireEvent.click(select);
    expect(screen.getByRole("dialog").textContent).toContain("zu: Status");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(fireEvent.pointerDown(select)).toBe(true);
  });
});
