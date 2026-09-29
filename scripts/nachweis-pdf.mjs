// Druckprüfung des Nachweises: meldet sich an, öffnet den Nachweis und schreibt ihn als A4-PDF – mit derselben
// Druckmaschine, die der Browser-Druck nutzt (Chromium). Einmal im hellen und einmal im dunklen Farbschema: beide
// PDFs müssen gleich (hell) aussehen, weil das dunkle Schema nur am Bildschirm gilt (globals.css).
// Zusätzlich einmal hell mit Hintergrundgrafiken (`nachweis-hell-hintergrund.pdf`): Seitenfläche und Karte müssen weiß
// und randlos bleiben.
// Aufruf: npm run shots:pdf -- --out screenshots/<label> [--base-url http://localhost:3000] [--query "from=2026-01-01&to=2026-03-31"]
//   [--umami-origin https://analytics.example.org]
// Voraussetzung wie npm run shots: Dev-Server gegen die Wegwerf-DB (npm run shots:dev), Seed eingespielt.
// Exit-Code 1 bei console.error, CSP-Verletzung oder unbehandeltem Fehler (Meldungen in der Konsole).
// --umami-origin: wie bei npm run shots – läuft der Server mit UMAMI_SCRIPT_URL dieser Origin, wird das Script im
// Browser durch einen Stub ersetzt (kein Netz) und muss geladen werden und /api/send erreichen – sonst Fehler.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { defaultBaseUrl, installUmamiStub, login, reportCspViolations, umamiProblem } from "./screenshots-lib.mjs";

const { values: args } = parseArgs({
  options: {
    out: { type: "string" },
    "base-url": { type: "string", default: defaultBaseUrl() },
    query: { type: "string", default: "from=2026-01-01&to=2026-03-31" },
    "umami-origin": { type: "string" },
  },
});
if (!args.out) {
  console.error("Bitte --out <ordner> angeben, z. B. --out screenshots/nachher");
  process.exit(1);
}
const outDir = path.resolve(args.out);
const baseUrl = args["base-url"].replace(/\/$/, "");
await mkdir(outDir, { recursive: true });

const problems = [];
const browser = await chromium.launch();
try {
  for (const scheme of ["light", "dark"]) {
    const context = await browser.newContext({ colorScheme: scheme, locale: "de-DE", timezoneId: "Europe/Berlin" });
    const page = await context.newPage();
    await context.addInitScript(reportCspViolations);
    const umamiHits = args["umami-origin"] ? await installUmamiStub(context, args["umami-origin"]) : null;
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(`${scheme}: ${page.url()}: ${message.text()}`);
    });
    page.on("pageerror", (error) => problems.push(`${scheme}: ${page.url()}: ${error.message}`));
    await login(page, baseUrl);
    await page.goto(`${baseUrl}/nachweis?${args.query}`);
    await page.locator("[data-nachweis-document]").waitFor();
    await page.evaluate(() => document.fonts.ready);
    // Das Next-Dev-Symbol ist nicht Teil der App und würde sonst mitgedruckt.
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    const file = path.join(outDir, `nachweis-${scheme === "dark" ? "dunkel" : "hell"}.pdf`);
    // preferCSSPageSize: die @page-Regel (A4 hochkant, Ränder) aus globals.css gilt – wie beim Browser-Druck.
    await page.pdf({ path: file, format: "A4", printBackground: false, preferCSSPageSize: true });
    console.log(`✓ ${path.relative(process.cwd(), file)}`);
    if (scheme === "light") {
      // Wie „Hintergrundgrafiken drucken“ im Browser: Seitenfläche und Kartenrahmen dürfen nicht mitkommen (#47).
      const withBackground = path.join(outDir, "nachweis-hell-hintergrund.pdf");
      await page.pdf({ path: withBackground, format: "A4", printBackground: true, preferCSSPageSize: true });
      console.log(`✓ ${path.relative(process.cwd(), withBackground)}`);
    }
    const umami = umamiHits && umamiProblem(umamiHits, args["umami-origin"]);
    if (umami) problems.push(`${scheme}: ${umami}`);
    await context.close();
  }
} finally {
  await browser.close();
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(`${problems.length} Konsolenfehler beim Nachweis-Druck`);
  process.exitCode = 1;
}
