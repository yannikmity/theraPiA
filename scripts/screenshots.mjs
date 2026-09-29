// Screenshot-Regression: meldet sich an und fotografiert alle Hauptseiten bei 390 px hoch, 844 px quer und 1440 px,
// jeweils mit emulierten iPhone-Safe-Areas (VIEWPORTS).
// Aufruf: npm run shots -- --out screenshots/<label> [--base-url http://localhost:3000] [--dark] [--only <name>]
//   [--umami-origin https://analytics.example.org]
// Voraussetzung: Server gegen die Wegwerf-DB läuft (npm run shots:dev, für Produktion mit --prod), Seed ist eingespielt
// und der Demo-Account registriert (node scripts/register-demo.mjs).
// Exit-Code 1, wenn eine Seite console.error, eine CSP-Verletzung oder einen unbehandelten Fehler hatte (probleme.json).
// --umami-origin: der Server läuft mit UMAMI_SCRIPT_URL dieser Origin; das Script wird im Browser durch einen Stub
// ersetzt (kein Netz) und muss geladen werden und /api/send erreichen – sonst Fehler.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import {
  PAGES,
  SCREENSHOT_USER,
  VIEWPORTS,
  defaultBaseUrl,
  emulateSafeArea,
  installUmamiStub,
  login,
  overflowWarning,
  pageOverflowPx,
  reportCspViolations,
  umamiProblem,
} from "./screenshots-lib.mjs";

const { values: args } = parseArgs({
  options: {
    out: { type: "string" },
    "base-url": { type: "string", default: defaultBaseUrl() },
    dark: { type: "boolean", default: false },
    only: { type: "string" },
    "umami-origin": { type: "string" },
  },
});
if (!args.out) {
  console.error("Bitte --out <ordner> angeben, z. B. --out screenshots/baseline");
  process.exit(1);
}
const outDir = path.resolve(args.out);
const baseUrl = args["base-url"].replace(/\/$/, "");
await mkdir(outDir, { recursive: true });

const problems = [];
const warnings = [];
const browser = await chromium.launch();

async function settle(page) {
  await page.waitForLoadState("load");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

try {
  for (const viewport of VIEWPORTS) {
    const schemes = args.dark ? ["light", "dark"] : ["light"];
    for (const scheme of schemes) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: scheme,
        locale: "de-DE",
        timezoneId: "Europe/Berlin",
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      await context.addInitScript(reportCspViolations);
      const umamiHits = args["umami-origin"] ? await installUmamiStub(context, args["umami-origin"]) : null;
      await emulateSafeArea(context, page, viewport.safeArea);
      const suffix = `${viewport.name}${scheme === "dark" ? "-dunkel" : ""}`;
      page.on("console", (message) => {
        if (message.type() === "error") {
          problems.push({ viewport: suffix, url: page.url(), text: message.text() });
        }
      });
      page.on("pageerror", (error) => problems.push({ viewport: suffix, url: page.url(), text: error.message }));

      // Angemeldeter Account (E-Mail); Demo-Seiten (entry.user) melden sich mit dem Demo-Account an.
      let loggedInAs = null;
      for (const entry of PAGES) {
        if (args.only && entry.name !== args.only) continue;
        if (entry.auth !== false) {
          const user = entry.user ?? SCREENSHOT_USER;
          if (loggedInAs !== user.email) {
            await context.clearCookies();
            await login(page, baseUrl, user);
            loggedInAs = user.email;
          }
        }
        // Druckansicht (media: "print") nur für die markierten Seiten; null setzt das Medium zurück.
        await page.emulateMedia({ media: entry.media ?? null });
        await page.goto(`${baseUrl}${entry.path}`);
        await settle(page);
        if (entry.interact) {
          await entry.interact(page.locator("main"), page);
          await settle(page);
        }
        // Interaktionen scrollen die Seite; fixierte Kopf-/Fußleisten landen sonst mitten im Bild.
        await page.evaluate(() => window.scrollTo(0, 0));
        const warning = overflowWarning(entry, suffix, page.url(), await page.evaluate(pageOverflowPx));
        if (warning) {
          warnings.push(warning);
          console.warn(`Warnung: ${warning.text} (${suffix})`);
        }
        const file = path.join(outDir, `${entry.name}-${suffix}.png`);
        // fullPage zeichnet fixierte Leisten (Bottom-Navigation) an der Viewport-Unterkante über den Inhalt.
        // Deshalb den Viewport für die Aufnahme auf die volle Dokumenthöhe ziehen und danach zurücksetzen;
        // der React-Zustand der Interaktion (offenes Formular, Nachfrage) übersteht das Resize.
        const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        await page.setViewportSize({ width: viewport.width, height: Math.max(fullHeight, viewport.height) });
        await settle(page);
        // Das Next-Dev-Symbol (unten links) ist nicht Teil der App und würde Navigation verdecken.
        await page.screenshot({
          path: file,
          animations: "disabled",
          style: "nextjs-portal { display: none !important; }",
        });
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        console.log(`✓ ${path.relative(process.cwd(), file)}`);
      }
      const umami = umamiHits && umamiProblem(umamiHits, args["umami-origin"]);
      if (umami) problems.push({ viewport: suffix, url: args["umami-origin"], text: umami });
      await context.close();
    }
  }
} finally {
  await browser.close();
}

await writeFile(path.join(outDir, "probleme.json"), JSON.stringify({ fehler: problems, warnungen: warnings }, null, 2));
if (problems.length > 0) {
  console.error(`${problems.length} Konsolenfehler – siehe ${path.join(args.out, "probleme.json")}`);
  process.exitCode = 1;
} else if (warnings.length > 0) {
  console.log(`Fertig ohne Konsolenfehler, ${warnings.length} Warnung(en) – siehe ${path.join(args.out, "probleme.json")}`);
} else {
  console.log(`Fertig ohne Konsolenfehler: ${outDir}`);
}
