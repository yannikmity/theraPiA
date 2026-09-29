import { describe, it, expect, vi } from "vitest";

// next/font lädt zur Bauzeit Schriftdateien, UmamiLoader liest die Laufzeit-Konfiguration – beides hier ohne Belang.
vi.mock("next/font/google", () => ({ Inter: () => ({ className: "inter" }) }));
vi.mock("@/components/analytics/UmamiLoader", () => ({ UmamiLoader: () => null }));
vi.mock("../globals.css", () => ({}));
const connection = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("next/server", () => ({ connection }));

import RootLayout, { viewport } from "../layout";

describe("Viewport", () => {
  it("nutzt die ganze Fläche (viewport-fit=cover), sonst bleibt env(safe-area-inset-*) auf iPhones 0", () => {
    expect(viewport).toMatchObject({ width: "device-width", initialScale: 1, viewportFit: "cover" });
  });

  it("lässt Zoomen zu (WCAG 1.4.4): kein maximumScale, kein userScalable: false", () => {
    expect(viewport).not.toHaveProperty("maximumScale");
    expect(viewport.userScalable).not.toBe(false);
  });
});

describe("RootLayout", () => {
  it("erzwingt dynamisches Rendering – ohne Anfrage gäbe es keine Nonce und die CSP blockierte Nexts Skripte", async () => {
    await RootLayout({ children: null });
    expect(connection).toHaveBeenCalledTimes(1);
  });
});
