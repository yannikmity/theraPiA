// Registriert den Demo-Account der Screenshot-Regression über den echten Weg (#9): Der Seed-Admin setzt in der
// Administration das Häkchen „Mit Beispieldaten starten“ und erzeugt den Link; ein frischer Browser-Kontext löst ihn
// über das Registrierungsformular ein und meldet sich an. Aufruf nach dem Seed, Server läuft:
//   node scripts/register-demo.mjs [--base-url http://localhost:3000] (Vorgabe folgt SHOTS_PORT wie bei shots)
// Gibt es den Demo-Account schon, verbraucht die Registrierung den Link ohne neuen Account (wie in der App) – die
// Anmeldung am Ende klappt trotzdem. Für einen frischen Account vorher neu seeden.
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { DEMO_USER, SCREENSHOT_USER, defaultBaseUrl, login } from "./screenshots-lib.mjs";

const { values: args } = parseArgs({
  options: { "base-url": { type: "string", default: defaultBaseUrl() } },
});
const baseUrl = args["base-url"].replace(/\/$/, "");
const kontext = { locale: "de-DE", timezoneId: "Europe/Berlin" };

const browser = await chromium.launch();
try {
  const admin = await browser.newContext(kontext);
  const adminPage = await admin.newPage();
  await login(adminPage, baseUrl, SCREENSHOT_USER);
  await adminPage.goto(`${baseUrl}/admin`);
  await adminPage.getByRole("checkbox", { name: /Mit Beispieldaten starten/ }).click();
  await adminPage.getByRole("button", { name: "Einladungslink erzeugen" }).click();
  await adminPage.getByText("Demo-Einladungslink (14 Tage gültig, mit Beispieldaten)").waitFor();
  const link = (await adminPage.getByText(/\/auth\/register\?invite=/).textContent())?.trim();
  if (!link) throw new Error("Kein Einladungslink angezeigt");
  await admin.close();

  const gast = await browser.newContext(kontext);
  const page = await gast.newPage();
  // Der Link trägt NEXTAUTH_URL; auf die Basis-URL des Laufs umbiegen, falls beide abweichen.
  await page.goto(link.replace(/^https?:\/\/[^/]+/, baseUrl));
  await page.getByLabel("Name").fill(DEMO_USER.name);
  await page.getByLabel("E-Mail").fill(DEMO_USER.email);
  await page.getByLabel("Passwort", { exact: true }).fill(DEMO_USER.password);
  await page.getByLabel("Passwort bestätigen").fill(DEMO_USER.password);
  await page.getByRole("button", { name: "Registrieren" }).click();
  await page.waitForURL((url) => url.pathname === "/auth/login");
  await login(page, baseUrl, DEMO_USER);
  await page.getByRole("note", { name: "Demo-Account" }).waitFor();
  await gast.close();
  console.log(`Demo-Account bereit: ${DEMO_USER.email} / ${DEMO_USER.password}`);
} catch (error) {
  console.error("Demo-Registrierung fehlgeschlagen:", error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
