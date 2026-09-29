import type { EventEmitter } from "node:events";
import { isPageMarginBoxParseError } from "./jsdom-noise";

// Gemeinsames Setup aller Test-Dateien (vitest.config: setupFiles). In node-Umgebungen (DB-Tests mit
// @vitest-environment node, Projekt „westlich-von-utc“) gibt es kein window – dann tut die Datei nichts.
if (typeof window !== "undefined") {
  // Radix (Checkbox in Formularen) misst Elemente per ResizeObserver, den jsdom nicht mitbringt. Zentral statt
  // vi.stubGlobal je Datei – dort fehlte teils das Aufräumen (#57).
  if (!("ResizeObserver" in globalThis)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  }

  // Vitest legt das JSDOM-Objekt als window.jsdom ab; dessen VirtualConsole meldet Parse-Fehler als „jsdomError“ und
  // schreibt sie über die Node-Konsole (nicht über vi.spyOn abfangbar). Den Parse-Fehler der Randboxen herausfiltern.
  const virtualConsole = (window as unknown as { jsdom?: { virtualConsole?: EventEmitter } }).jsdom?.virtualConsole;
  if (virtualConsole) {
    type JsdomError = Error & { detail?: unknown };
    const forward = virtualConsole.listeners("jsdomError") as ((error: JsdomError) => void)[];
    virtualConsole.removeAllListeners("jsdomError");
    virtualConsole.on("jsdomError", (error: JsdomError) => {
      if (isPageMarginBoxParseError(error)) return;
      for (const listener of forward) listener(error);
    });
  }
}
