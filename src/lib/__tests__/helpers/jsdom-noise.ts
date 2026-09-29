// jsdoms CSS-Parser kennt die @page-Randboxen der Nachweis-Fußzeile (@bottom-center, NachweisDocument.printFooterCss)
// nicht und meldet jedes Rendern als „Could not parse CSS stylesheet“ – Rauschen, kein Fehler: Chromium druckt die
// Fußzeile (npm run shots:pdf). Nur genau diese Meldung wird verschluckt, andere jsdom-Fehler bleiben sichtbar (#57).
const PAGE_MARGIN_BOX = /@(?:top|bottom|left|right)-[a-z-]+\s*\{/;

export function isPageMarginBoxParseError(error: { message?: string; detail?: unknown }): boolean {
  return error.message === "Could not parse CSS stylesheet" && PAGE_MARGIN_BOX.test(String(error.detail ?? ""));
}
