// Gemeinsame Bausteine der Screenshot-Regression (seed-screenshots.mjs, screenshots.mjs, fab-clearance.mjs,
// nachweis-pdf.mjs, register-demo.mjs, dev-screenshots.mjs).
// Reines Node ohne Abhängigkeiten, damit der Test es direkt importieren kann.

export const SCREENSHOT_USER = {
  email: "pia@example.com",
  password: "Screenshot-Passwort-2026",
  name: "PiA Beispiel",
};

// Demo-Account (#9): registriert scripts/register-demo.mjs über eine Einladung „Mit Beispieldaten starten“.
export const DEMO_USER = {
  email: "demo@example.com",
  password: "Demo-Passwort-2026",
  name: "PiA Demo",
};

// Anmeldung (screenshots.mjs, fab-clearance.mjs, nachweis-pdf.mjs, register-demo.mjs); ohne Account der Seed-Account.
export async function login(page, baseUrl, user = SCREENSHOT_USER) {
  await page.goto(`${baseUrl}/auth/login`);
  await page.getByLabel("E-Mail").fill(user.email);
  await page.getByLabel("Passwort").fill(user.password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

// safeArea: Abstände um Dynamic Island und Home-Indikator eines aktuellen iPhones (px), per CDP emuliert
// (emulateSafeArea) – sonst wären env(safe-area-inset-*) im Harness immer 0 und Fehler im Querformat unsichtbar (#56).
// Querformat 844 px liegt über md (768 px): dort gilt das Desktop-Layout mit Seitenleiste.
export const VIEWPORTS = [
  { name: "mobil", width: 390, height: 844, safeArea: { top: 59, right: 0, bottom: 34, left: 0 } },
  { name: "mobil-quer", width: 844, height: 390, safeArea: { top: 0, right: 59, bottom: 21, left: 59 } },
  { name: "desktop", width: 1440, height: 900, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } },
];

// Niedriges Handy für die Ränder-Prüfung in fab-clearance.mjs: hier erreicht das Feedback-Panel seine Maximalhöhe und
// ein hohes Auth-Formular füllt den Bildschirm.
export const LOW_VIEWPORT = { name: "mobil-niedrig", width: 390, height: 560, safeArea: { top: 59, right: 0, bottom: 34, left: 0 } };

// Chromium kennt seit Version 136 Emulation.setSafeAreaInsetsOverride; die Einstellung gilt für die eine Seite (Target)
// und übersteht Navigation, Resize und emulateMedia.
export async function emulateSafeArea(context, page, safeArea) {
  const session = await context.newCDPSession(page);
  await session.send("Emulation.setSafeAreaInsetsOverride", { insets: safeArea });
}

// Kalendertag in Europe/Berlin als YYYY-MM-DD („en-CA“ formatiert so) – wie todayIso in src/lib/dates.ts, hier ohne
// TypeScript, weil Seed und Harness reines Node sind.
const berlinDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });

export function berlinDayIso(instant = new Date()) {
  return berlinDay.format(instant);
}

// Kalendertag vor n Tagen: erst den Berliner Kalendertag bestimmen, dann in UTC-Tagen rechnen. `Date.now() − n × 24 h`
// verschiebt sich um eine Stunde, wenn dazwischen die Sommerzeit wechselt, und landet nachts auf dem falschen Tag.
export function daysAgoIso(n, now = new Date()) {
  const [year, month, day] = berlinDayIso(now).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - n)).toISOString().slice(0, 10);
}

// Der Seed leert die Datenbank komplett – deshalb nur Datenbanken mit „screenshot“ im Namen.
export function assertThrowawayDatabase(databaseUrl) {
  let name;
  try {
    name = new URL(databaseUrl).pathname.replace(/^\//, "");
  } catch {
    throw new Error("DATABASE_URL ist keine gültige URL");
  }
  if (!name.includes("screenshot")) {
    throw new Error(
      `Sicherheitsstopp: Datenbank „${name}“ enthält nicht „screenshot“ – der Seed würde sie komplett leeren.`
    );
  }
  return name;
}

export const DEFAULT_SHOTS_PORT = 3000;

// Port des Harness-Dev-Servers: --port schlägt SHOTS_PORT, sonst 3000. Parallele Arbeitsstände (mehrere Checkouts)
// brauchen je einen eigenen Port; ohne Angabe bleibt alles wie bisher.
/** @param {string} [flag] @param {Record<string, string | undefined>} [env] */
export function shotsPort(flag, env = process.env) {
  const raw = flag ?? env.SHOTS_PORT;
  if (raw === undefined || raw === "") return DEFAULT_SHOTS_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Ungültiger Port „${raw}“ – erwartet eine ganze Zahl von 1 bis 65535`);
  }
  return port;
}

// Vorgabe für --base-url von shots, shots:fab und shots:pdf – folgt SHOTS_PORT.
/** @param {Record<string, string | undefined>} [env] */
export function defaultBaseUrl(env = process.env) {
  return `http://localhost:${shotsPort(undefined, env)}`;
}

// Seite breiter als der Viewport (#43): waagerechtes Scrollen der ganzen Seite ist am Handy fast immer ein Layoutfehler
// (zu breite Tabelle, nicht umbrechende Zahl). Läuft im Browser (page.evaluate) – nur DOM-Globals, keine Importe.
export function pageOverflowPx() {
  const doc = document.documentElement;
  return Math.max(doc.scrollWidth, document.body.scrollWidth) - doc.clientWidth;
}

// Warnung statt Fehler: der Lauf bleibt grün, die Meldung steht in der Konsole und in probleme.json. Im Druckmedium
// (media: "print") stehen Tabellen bewusst über (print:overflow-visible), dort keine Warnung.
export function overflowWarning(entry, suffix, url, overflowPx) {
  if (entry.media === "print" || overflowPx <= 0) return null;
  return { viewport: suffix, url, text: `Seite ${entry.name} ist ${overflowPx} px breiter als der Viewport` };
}

// Seiten in Aufnahmereihenfolge. Auth-Seiten (auth: false) zuerst, danach meldet sich das Harness an.
// interact(main, page) bringt eine Seite vor dem Screenshot in einen Zustand (Formular offen, Nachfrage sichtbar).
// Alle Selektoren sind Rollen/Beschriftungen, die vor und nach der Migration gleich bleiben.
// media: "print" nimmt die Seite im Druckmedium auf (Nachweis ohne Navigation und Filter).
// Einträge mit `user` nimmt das Harness mit diesem Account auf (vorher abgemeldet); sie stehen am Ende, damit nur einmal
// gewechselt wird.
export const PAGES = [
  { name: "login", path: "/auth/login", auth: false },
  { name: "registrierung", path: "/auth/register", auth: false },
  { name: "reset", path: "/auth/reset?token=beispiel", auth: false },
  { name: "login-account-geloescht", path: "/auth/login?accountDeleted=true", auth: false },
  { name: "dashboard", path: "/" },
  {
    name: "dashboard-prognose",
    path: "/",
    interact: async (main) => {
      await main.getByText("So kommt die Prognose zustande").click();
    },
  },
  {
    name: "feedback-auswahl",
    path: "/",
    interact: async (_main, page) => {
      await page.getByRole("button", { name: "Feedback geben" }).click();
    },
  },
  {
    name: "feedback-panel",
    path: "/",
    interact: async (main, page) => {
      await page.getByRole("button", { name: "Feedback geben" }).click();
      await main.getByRole("heading", { level: 1 }).first().click();
      const dialog = page.getByRole("dialog", { name: "Feedback geben" });
      await dialog.getByLabel("Feedback-Text").waitFor();
      // Aufnahme abwarten, sonst zeigt das Bild je nach Tempo „wird aufgenommen …“ oder die Vorschau.
      await dialog.getByAltText("Vorschau des Screenshots").waitFor();
    },
  },
  { name: "erfassen", path: "/sessions/new" },
  {
    name: "erfassen-supervision",
    path: "/sessions/new",
    interact: async (main) => {
      await main.getByText("Supervision", { exact: true }).click();
    },
  },
  {
    name: "erfassen-vorschlaege",
    path: "/sessions/new",
    interact: async (main) => {
      await main.getByRole("button", { name: /Wie letzte Woche/ }).click();
    },
  },
  {
    name: "erfassen-vorbelegt",
    path: "/patients",
    interact: async (main, page) => {
      await main.getByRole("link", { name: /A-1(?!\d)/ }).first().click();
      await page.waitForURL(/\/patients\/[^/]+$/);
      await main.getByRole("link", { name: "Sitzung für A-1 erfassen" }).click();
      await page.waitForURL(/patient=/);
    },
  },
  { name: "patientinnen", path: "/patients" },
  {
    name: "patientinnen-neu",
    path: "/patients",
    interact: async (main) => {
      await main.getByRole("button", { name: "Neu" }).click();
    },
  },
  {
    name: "patientin-detail",
    path: "/patients",
    interact: async (main, page) => {
      await main.getByRole("link", { name: /A-1/ }).first().click();
      await page.waitForURL(/\/patients\/[^/]+$/);
    },
  },
  {
    name: "patientin-detail-bearbeiten",
    path: "/patients",
    interact: async (main, page) => {
      await main.getByRole("link", { name: /A-1/ }).first().click();
      await page.waitForURL(/\/patients\/[^/]+$/);
      await main.getByRole("button", { name: "Sitzung bearbeiten" }).first().click();
    },
  },
  {
    name: "patientin-detail-loeschen-nachfrage",
    path: "/patients",
    interact: async (main, page) => {
      await main.getByRole("link", { name: /A-1/ }).first().click();
      await page.waitForURL(/\/patients\/[^/]+$/);
      await main.getByRole("button", { name: "Sitzung löschen" }).first().click();
    },
  },
  { name: "supervision", path: "/supervision" },
  {
    name: "supervision-bearbeiten",
    path: "/supervision",
    interact: async (main) => {
      await main.getByRole("button", { name: "Supervision bearbeiten" }).first().click();
    },
  },
  { name: "supervisorinnen", path: "/supervisors" },
  { name: "gruppen", path: "/groups" },
  {
    name: "gruppe-detail",
    path: "/groups",
    interact: async (main, page) => {
      await main.getByRole("link", { name: /Gruppe Beispiel/ }).first().click();
      await page.waitForURL(/\/groups\/[^/]+$/);
    },
  },
  { name: "finanzen", path: "/finances" },
  { name: "nachweis", path: "/nachweis?from=2026-01-01&to=2026-03-31" },
  {
    name: "nachweis-supervisorin",
    path: "/nachweis?from=2026-01-01&to=2026-03-31",
    interact: async (main, page) => {
      await main.getByLabel("Supervisor:in", { exact: true }).selectOption({ label: "Supervision Nord" });
      await main.getByRole("button", { name: "Anzeigen" }).click();
      await page.waitForURL(/supervisor=/);
    },
  },
  { name: "nachweis-druck", path: "/nachweis?from=2026-01-01&to=2026-03-31", media: "print" },
  { name: "profil", path: "/profile" },
  { name: "passwort", path: "/profile/password" },
  { name: "meine-daten", path: "/profile/data" },
  {
    name: "meine-daten-loeschen-nachfrage",
    path: "/profile/data",
    interact: async (main) => {
      await main.getByLabel("Passwort zur Bestätigung").fill(SCREENSHOT_USER.password);
      await main.getByRole("button", { name: "Account endgültig löschen" }).click();
    },
  },
  { name: "checkliste", path: "/checklist" },
  { name: "admin", path: "/admin" },
  { name: "admin-feedback", path: "/admin/feedback" },
  { name: "admin-ausbildungsprofil", path: "/admin/ausbildungsprofil" },
  { name: "admin-ebm-staffel", path: "/admin/ebm-staffel" },
  {
    name: "admin-ebm-staffel-neu",
    path: "/admin/ebm-staffel",
    interact: async (_main, page) => {
      await page.getByRole("button", { name: "Neue Staffel" }).click();
    },
  },
  { name: "meine-regeln", path: "/profile/regeln" },
  {
    name: "meine-regeln-abweichung",
    path: "/profile/regeln",
    interact: async (main) => {
      await main.getByRole("button", { name: "Behandlungsstunden: Abweichung festlegen" }).click();
    },
  },
  // Demo-Account (#9): frisch über eine Demo-Einladung registriert (scripts/register-demo.mjs), Daten relativ zum
  // Registrierungstag – Hinweis oben auf jeder Seite.
  { name: "demo-dashboard", path: "/", user: DEMO_USER },
  {
    name: "demo-dashboard-prognose",
    path: "/",
    user: DEMO_USER,
    interact: async (main) => {
      await main.getByText("So kommt die Prognose zustande").click();
    },
  },
  { name: "demo-patientinnen", path: "/patients", user: DEMO_USER },
  { name: "demo-supervision", path: "/supervision", user: DEMO_USER },
  {
    name: "demo-gruppe-detail",
    path: "/groups",
    user: DEMO_USER,
    interact: async (main, page) => {
      await main.getByRole("link", { name: /Gruppe Beispiel/ }).first().click();
      await page.waitForURL(/\/groups\/[^/]+$/);
    },
  },
  { name: "demo-finanzen", path: "/finances", user: DEMO_USER },
  { name: "demo-nachweis", path: "/nachweis", user: DEMO_USER },
];

// Formularseiten mit einem Hauptknopf am Ende (scripts/fab-clearance.mjs): am Seitenende darf der Feedback-Knopf ihn
// nicht überdecken. `button` ist der exakte Name des Knopfs, `interact` bringt die Seite in den Zustand.
export const FAB_CHECKS = [
  {
    name: "erfassen-vorschlaege",
    path: "/sessions/new",
    interact: async (main) => {
      await main.getByRole("button", { name: /Wie letzte Woche/ }).click();
    },
    button: "Speichern",
  },
  {
    name: "erfassen-supervision",
    path: "/sessions/new",
    interact: async (main) => {
      await main.getByText("Supervision", { exact: true }).click();
    },
    button: "Speichern",
  },
  { name: "finanzen", path: "/finances", button: "Einstellungen speichern" },
  { name: "passwort", path: "/profile/password", button: "Passwort ändern" },
  {
    name: "patientinnen-neu",
    path: "/patients",
    interact: async (main) => {
      await main.getByRole("button", { name: "Neu" }).click();
    },
    button: "Anlegen",
  },
  {
    name: "supervisorinnen-neu",
    path: "/supervisors",
    interact: async (main) => {
      await main.getByRole("button", { name: "Neu" }).click();
    },
    button: "Anlegen",
  },
  {
    name: "patientin-detail-bearbeiten",
    path: "/patients",
    interact: async (main, page) => {
      await main.getByRole("link", { name: /A-1(?!\d)/ }).first().click();
      await page.waitForURL(/\/patients\/[^/]+$/);
      await main.getByRole("button", { name: "Sitzung bearbeiten" }).first().click();
    },
    button: "Speichern",
  },
  {
    name: "supervision-bearbeiten",
    path: "/supervision",
    interact: async (main) => {
      await main.getByRole("button", { name: "Supervision bearbeiten" }).first().click();
    },
    button: "Speichern",
  },
  { name: "admin-ausbildungsprofil", path: "/admin/ausbildungsprofil", button: "Ausbildungsprofil speichern" },
  {
    name: "admin-ebm-staffel-neu",
    path: "/admin/ebm-staffel",
    interact: async (_main, page) => {
      await page.getByRole("button", { name: "Neue Staffel" }).click();
    },
    button: "Staffel speichern",
  },
  { name: "meine-regeln", path: "/profile/regeln", button: "Regeln speichern" },
];

// CSP-Verletzungen (#12): Präfix der Meldung, die reportCspViolations im Browser als console.error ausgibt. Die
// Harness-Skripte zählen jeden console.error als Fehler – eine Verletzung lässt den Lauf also fehlschlagen.
export const CSP_VIOLATION_PREFIX = "CSP-Verletzung:";

// Läuft im Browser vor jedem Seitenskript (context.addInitScript). Chromium meldet blockierte Skripte zwar meist
// selbst in der Konsole, das Ereignis securitypolicyviolation ist aber die verlässliche Quelle. Eigenständig ohne
// Bezug auf Modul-Variablen, weil Playwright nur den Funktionstext in die Seite überträgt.
export function reportCspViolations() {
  document.addEventListener("securitypolicyviolation", (event) => {
    console.error(
      `CSP-Verletzung: ${event.effectiveDirective} blockiert ${event.blockedURI || "inline"} (${event.sourceFile || "?"}:${event.lineNumber || 0})`
    );
  });
}

// Ersatz für das Umami-Script (keine echte Instanz, kein Netz): stellt window.umami.track bereit wie Umami und
// schickt jeden Aufruf per POST an <origin>/api/send. text/plain vermeidet den CORS-Preflight – geprüft wird die
// CSP (script-src, connect-src), nicht CORS.
export function umamiStubScript(origin) {
  const endpoint = JSON.stringify(`${origin}/api/send`);
  return `window.umami = {
  track(arg, data) {
    const base = { hostname: location.hostname, language: navigator.language, referrer: document.referrer,
      screen: screen.width + "x" + screen.height, title: document.title, url: location.pathname };
    const payload = typeof arg === "function" ? arg(base) : { ...base, name: arg, data };
    fetch(${endpoint}, { method: "POST", headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ type: "event", payload }) }).catch(() => {});
  },
};`;
}

// --umami-origin darf mit „/“ enden oder die volle Script-URL sein: zählt nur die Origin, sonst passt das
// Route-Muster <origin>/** nicht. Ungültige Eingabe (kein http(s)) bricht mit klarer Meldung ab.
export function normalizeUmamiOrigin(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    url = null;
  }
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new Error(`--umami-origin „${input}“ ist keine gültige http(s)-URL, z. B. https://analytics.example.org`);
  }
  return url.origin;
}

// Fängt alle Anfragen an die Umami-Origin im Browser-Kontext ab und zählt sie. Der Browser prüft die CSP, bevor
// eine Anfrage das Netz (und damit diesen Handler) erreicht: Blockiert die CSP das Script oder /api/send, bleibt
// der jeweilige Zähler 0 (umamiProblem). Vor dem ersten Seitenaufruf des Kontexts aufrufen.
export async function installUmamiStub(context, input) {
  const origin = normalizeUmamiOrigin(input);
  const hits = { script: 0, send: 0 };
  await context.route(`${origin}/**`, async (route) => {
    const cors = { "access-control-allow-origin": "*" };
    if (new URL(route.request().url()).pathname === "/api/send") {
      hits.send += 1;
      return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: '{"ok":true}' });
    }
    hits.script += 1;
    return route.fulfill({ status: 200, headers: cors, contentType: "text/javascript", body: umamiStubScript(origin) });
  });
  return hits;
}

export function umamiProblem(hits, origin) {
  if (hits.script > 0 && hits.send > 0) return null;
  return `Umami (${origin}): Script ${hits.script}×, /api/send ${hits.send}× – erwartet je mindestens 1 (CSP blockiert?)`;
}

// Startbefehl für den Harness-Server (scripts/dev-screenshots.mjs). --prod prüft das, was ausgeliefert wird: CSP ohne
// 'unsafe-eval', gebaute Skripte (vorher npm run build). Die env-Werte sind Vorgaben, die nur greifen, wenn die
// Variable nicht schon gesetzt ist: NEXTAUTH_URL passend zum Port (sonst leitet die Anmeldung auf Port 3000 um),
// in Produktion AUTH_TRUST_HOST wie im Docker-Image (sonst „UntrustedHost“) und ein beschreibbarer Feedback-Ordner
// statt /data/feedback.
export function nextServerCommand({ prod, port }) {
  const env = { NEXTAUTH_URL: `http://localhost:${port}` };
  if (prod) Object.assign(env, { AUTH_TRUST_HOST: "true", FEEDBACK_DIR: "./data/feedback" });
  return { args: [prod ? "start" : "dev", "-p", String(port)], env };
}
