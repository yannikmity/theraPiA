// Prüft im echten Viewport (390×844, 844×390 und 1440×900), dass der Feedback-Knopf am Seitenende weder den Hauptknopf eines
// Formulars noch die Bottom-Navigation überdeckt und selbst sichtbar bleibt (#49). Danach der Ränder-Durchlauf
// (EDGE_CHECKS) über alle Ansichten plus LOW_VIEWPORT (#56).
// Aufruf: npm run shots:fab [-- --base-url http://localhost:3000]
// Voraussetzung wie npm run shots: Dev-Server gegen die Wegwerf-DB (npm run shots:dev), Seed eingespielt (npm run shots:seed).
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { FAB_CHECKS, LOW_VIEWPORT, VIEWPORTS, defaultBaseUrl, emulateSafeArea, login } from "./screenshots-lib.mjs";

const { values: args } = parseArgs({ options: { "base-url": { type: "string", default: defaultBaseUrl() } } });
const baseUrl = args["base-url"].replace(/\/$/, "");

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const box = (b) => `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}×${Math.round(b.height)}`;
// Dashboard öffnen; leitet die App zur Anmeldung um, zuerst anmelden.
async function openDashboard(page, baseUrl) {
  await page.goto(`${baseUrl}/`);
  if (new URL(page.url()).pathname.startsWith("/auth/")) await login(page, baseUrl);
  await page.waitForLoadState("load");
}

// Ränder (#56): Safe-Areas und Feedback-Panel – je Ansicht einmal, dazu LOW_VIEWPORT. Jede Prüfung liefert Befundtexte
// (leere Liste = in Ordnung) und kümmert sich selbst um Navigation und Anmeldung. Prüfungen, die nicht angemeldet
// laufen müssen, stehen vorn.
const EDGE_CHECKS = [
  {
    // Auth-Seiten (#56): Die Innenabstände des zentrierten Rahmens müssen die Safe-Areas abdecken – sonst rutscht der
    // Schriftzug bei hohem Formular unter die Statusleiste (py-12 = 48 px < 59 px) bzw. im Querformat an die Notch.
    // Gemessen wird der Abstand selbst, unabhängig davon, ob das Formular gerade höher als der Bildschirm ist.
    // Läuft vor der Anmeldung – deshalb der erste Eintrag.
    name: "Auth-Layout",
    run: async (page, viewport, baseUrl) => {
      await page.goto(`${baseUrl}/auth/register`);
      await page.waitForLoadState("load");
      // Fehlt der Rahmen (z. B. nach einem Umbau der Klasse), meldet die Prüfung das als Befund statt abzubrechen.
      const padding = await page.getByRole("link", { name: "theraPiA – zum Dashboard" }).evaluate((el) => {
        const frame = el.closest(".min-h-svh");
        if (!frame) return null;
        const style = getComputedStyle(frame);
        return {
          top: parseFloat(style.paddingTop),
          right: parseFloat(style.paddingRight),
          bottom: parseFloat(style.paddingBottom),
          left: parseFloat(style.paddingLeft),
        };
      });
      if (!padding) return ["Rahmen nicht gefunden (.min-h-svh um den Schriftzug)"];
      return ["top", "right", "bottom", "left"]
        .filter((side) => padding[side] < viewport.safeArea[side])
        .map((side) => `Abstand ${side} ${padding[side]} px, Safe-Area ${viewport.safeArea[side]} px`);
    },
  },
  {
    // Querformat (#56): Feedback-Knopf, erster Navigationslink und Inhalt von <main> liegen seitlich innerhalb der
    // Safe-Areas – md:px-8, w-60 und right-6 ignorierten safe-area-inset-left/right.
    name: "Safe-Area seitlich",
    run: async (page, viewport, baseUrl) => {
      await openDashboard(page, baseUrl);
      const { left, right } = viewport.safeArea;
      const limit = viewport.width - right;
      const found = [];
      const fab = await page.getByRole("button", { name: "Feedback geben" }).boundingBox();
      if (fab && (fab.x < left || fab.x + fab.width > limit)) found.push(`Feedback-Knopf ragt in die Safe-Area (${box(fab)})`);
      const nav = page.getByRole("navigation", { name: "Hauptnavigation" }).filter({ visible: true }).first();
      const link = await nav.getByRole("link").first().boundingBox();
      if (link && (link.x < left || link.x + link.width > limit)) found.push(`Navigationslink ragt in die Safe-Area (${box(link)})`);
      const content = await page.locator("main").evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return { left: rect.left + parseFloat(style.paddingLeft), right: rect.right - parseFloat(style.paddingRight) };
      });
      if (content.left < left || content.right > limit) {
        found.push(`Inhalt reicht in die Safe-Area (${Math.round(content.left)}–${Math.round(content.right)} px, frei ${left}–${limit} px)`);
      }
      return found;
    },
  },
  {
    // Feedback-Panel in voller Höhe (#56): Oberkante unterhalb der Safe-Area oben, seitlich innerhalb der Safe-Areas.
    // Gemessen wird die Lage bei Maximalhöhe (Unterkante − max-height), unabhängig davon, wie viel Inhalt das Panel
    // gerade hat – mit max-h-[calc(100svh-6rem)] lag sie um „Safe-Area unten − 1,5rem“ (≈ −10 px) über dem Bild.
    name: "Feedback-Panel",
    run: async (page, viewport, baseUrl) => {
      await openDashboard(page, baseUrl);
      await page.getByRole("button", { name: "Feedback geben" }).click();
      await page.locator("main").getByRole("heading", { level: 1 }).first().click();
      const dialog = page.getByRole("dialog", { name: "Feedback geben" });
      await dialog.getByAltText("Vorschau des Screenshots").waitFor();
      const g = await dialog.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return { maxHeight: parseFloat(getComputedStyle(el).maxHeight), bottom: rect.bottom, left: rect.left, right: rect.right };
      });
      const { top, right, bottom, left } = viewport.safeArea;
      const found = [];
      // Ohne endliche max-height („none“ → NaN) ist die Lage bei Maximalhöhe nicht bestimmbar – Befund statt stillem Bestehen.
      if (!Number.isFinite(g.maxHeight)) found.push("max-height fehlt – Lage bei Maximalhöhe nicht prüfbar");
      const fullTop = g.bottom - g.maxHeight;
      if (fullTop < top) found.push(`Oberkante in voller Höhe bei ${Math.round(fullTop)} px, Safe-Area oben ${top} px`);
      if (g.bottom > viewport.height - bottom) found.push(`Unterkante bei ${Math.round(g.bottom)} px, frei bis ${viewport.height - bottom} px`);
      if (g.left < left || g.right > viewport.width - right) found.push(`Panel ragt seitlich in die Safe-Area (${Math.round(g.left)}–${Math.round(g.right)} px)`);
      return found;
    },
  },
];

const problems = [];
const browser = await chromium.launch();
try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      locale: "de-DE",
      timezoneId: "Europe/Berlin",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await emulateSafeArea(context, page, viewport.safeArea);
    await login(page, baseUrl);
    for (const check of FAB_CHECKS) {
      const label = `${check.name} @ ${viewport.name}`;
      await page.goto(`${baseUrl}${check.path}`);
      await page.waitForLoadState("load");
      if (check.interact) await check.interact(page.locator("main"), page);
      const button = page.locator("main").getByRole("button", { name: check.button, exact: true }).last();
      await button.waitFor();
      // Ans Seitenende scrollen – dort liegt der Knopf am tiefsten, direkt über der freigehaltenen Zone.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(300);
      const fab = page.getByRole("button", { name: "Feedback geben" });
      // Nur die sichtbare Hauptnavigation: am Handy die Bottom-Navigation, am Desktop die Sidebar (beide tragen das Label).
      const nav = page.getByRole("navigation", { name: "Hauptnavigation" }).filter({ visible: true }).first();
      const [b, f, n] = await Promise.all([button.boundingBox(), fab.boundingBox(), nav.boundingBox()]);
      const before = problems.length;
      if (!b || !f) problems.push(`${label}: Knopf „${check.button}“ oder Feedback-Knopf nicht gefunden`);
      else {
        if (overlaps(b, f)) problems.push(`${label}: Feedback-Knopf (${box(f)}) überdeckt „${check.button}“ (${box(b)})`);
        if (f.y + f.height > viewport.height || f.y < 0) problems.push(`${label}: Feedback-Knopf liegt außerhalb des Viewports (${box(f)})`);
        // Handy: Bottom-Navigation am unteren Rand. Desktop: Sidebar links – sie kann den Knopf rechts nicht treffen,
        // die Prüfung läuft trotzdem mit.
        if (n && overlaps(f, n)) problems.push(`${label}: Feedback-Knopf überdeckt die Hauptnavigation (${box(n)})`);
      }
      console.log(`${problems.length > before ? "✗" : "✓"} ${label}`);
    }
    await context.close();
  }
  for (const viewport of [...VIEWPORTS, LOW_VIEWPORT]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      locale: "de-DE",
      timezoneId: "Europe/Berlin",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await emulateSafeArea(context, page, viewport.safeArea);
    for (const check of EDGE_CHECKS) {
      const label = `${check.name} @ ${viewport.name}`;
      const found = await check.run(page, viewport, baseUrl);
      for (const text of found) problems.push(`${label}: ${text}`);
      console.log(`${found.length > 0 ? "✗" : "✓"} ${label}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Feedback-Zone und Ränder frei auf allen geprüften Seiten.");
}
