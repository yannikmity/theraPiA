# Mitmachen bei theraPiA

Danke für dein Interesse! Fehlerberichte, Ideen aus dem Ausbildungsalltag und Pull Requests sind willkommen.

## Issues

- **Fehler:** Was hast du gemacht, was ist passiert, was hast du erwartet? Screenshots helfen.
- **Ideen:** Beschreib das Problem aus Sicht von PiA oder Institut, nicht nur die Lösung.
- **Keine echten Daten:** Bitte niemals Patient:innendaten, Klarnamen oder echte Sitzungsdaten in Issues, Screenshots oder Testdaten verwenden.

## Pull Requests

1. Fork anlegen und einen Branch vom aktuellen `master` abzweigen.
2. Lokal aufsetzen wie in der [README](README.md) beschrieben.
3. Vor dem PR: `npm run lint` und `npx vitest run` müssen grün sein. Neue Berechnungslogik bitte mit Tests.
4. Kleine, fokussierte PRs mit kurzer Beschreibung, was und warum.

## Oberfläche ändern: Screenshot-Regression

UI-Änderungen werden mit Screenshots aller Hauptseiten bei 390 px (Handy hoch), 844 px (Handy quer) und 1440 px (Desktop) geprüft – mit emulierten iPhone-Safe-Areas (Notch, Home-Indikator). Das läuft gegen eine eigene Wegwerf-Datenbank mit fiktiven Daten, nie gegen deine Arbeitsdaten:

1. Einmalig: `npx playwright install chromium` und `docker compose exec -T postgres createdb -U therapia_user therapia_screenshots`
2. `npm run shots:migrate`, dann `npm run shots:seed` (leert die Wegwerf-DB und füllt sie neu)
3. `npm run shots:dev` startet die App auf Port 3000 gegen diese Datenbank. Arbeiten mehrere Checkouts parallel, bekommt jeder einen eigenen Port: `npm run shots:dev -- --port 3320` (oder `SHOTS_PORT=3320`); die übrigen Skripte folgen `SHOTS_PORT` oder bekommen `--base-url http://localhost:3320`.
4. In einem zweiten Terminal, einmal nach jedem Seed: `node scripts/register-demo.mjs` (folgt wie die übrigen Skripte `SHOTS_PORT` bzw. `--base-url`, Standard Port 3000). Das Skript lädt als Admin mit dem Häkchen „Mit Beispieldaten starten“ ein und registriert den Demo-Account über das Formular (`demo@example.com`); ohne ihn scheitern die Aufnahmen `demo-*` beim Anmelden.
5. Anschließend im selben Terminal: `npm run shots -- --out screenshots/vorher` vor der Änderung, `npm run shots -- --out screenshots/nachher` danach (`--dark` nimmt jede Ansicht zusätzlich im dunklen Schema auf). Meldet der Lauf `Warnung: Seite … breiter als der Viewport`, scrollt die Seite waagerecht – meist eine zu breite Tabelle oder eine nicht umbrechende Zahl; beheben, nicht ignorieren.
6. Bei Änderungen am Nachweis oder am Drucklayout zusätzlich `npm run shots:pdf -- --out screenshots/nachher` – erzeugt den Nachweis als A4-PDF, einmal hell, einmal dunkel und einmal hell mit Hintergrundgrafiken; hell und dunkel müssen gleich aussehen, mit Hintergrundgrafiken darf keine graue Seitenfläche und keine Kartenrundung erscheinen.
7. Bei Änderungen an Layout, Navigation oder dem Feedback-Widget zusätzlich `npm run shots:fab` – prüft im echten Viewport (390 px hoch, 844 px quer, 1440 px), dass der Feedback-Knopf am Seitenende keinen Speichern-Knopf und nicht die Bottom-Navigation überdeckt, und im Ränder-Durchlauf (dazu 390×560), dass Navigation, Inhalt, Feedback-Knopf und -Panel innerhalb der Safe-Areas liegen. Neue Formularseiten in `FAB_CHECKS` (`scripts/screenshots-lib.mjs`) eintragen.
8. Bei Änderungen an Skripten, Proxy, Content-Security-Policy oder Umami zusätzlich gegen den Produktionsserver prüfen – nur dort gilt die CSP ohne `'unsafe-eval'`: `npm run build`, dann `UMAMI_SCRIPT_URL=https://analytics.example.org/script.js UMAMI_WEBSITE_ID=11111111-1111-4111-8111-111111111111 npm run shots:dev -- --prod --port 3100` und im zweiten Terminal `npm run shots -- --out screenshots/prod --base-url http://localhost:3100 --umami-origin https://analytics.example.org` sowie `npm run shots:pdf -- --out screenshots/prod --base-url http://localhost:3100 --umami-origin https://analytics.example.org`. Die Harness-Skripte melden jede CSP-Verletzung als Fehler (`CSP-Verletzung: …` in `probleme.json`); `--umami-origin` ersetzt das Umami-Script im Browser durch einen Stub und prüft, dass es laden und `/api/send` erreichen darf. Inline-Skripte brauchen die Nonce aus dem Proxy (`(await headers()).get(NONCE_HEADER)` mit `NONCE_HEADER` aus `src/lib/csp.ts`, wie in `src/components/analytics/UmamiLoader.tsx`), `'unsafe-inline'` für Skripte gibt es nicht. Neue Inline-Skripte bzw. `<Script>` mit Nonce gehören ins Root-Layout: Die Nonce gilt für das beim Aufruf geladene Dokument, erst nach einer Client-Navigation eingefügte Skripte bekämen eine unpassende Nonce. Eine andere Wegwerf-Datenbank lässt sich per `DATABASE_URL=…` vor den `shots:*`-Befehlen setzen (Name muss „screenshot“ enthalten).

Vorher- und Nachher-Lauf bitte am selben Tag aufnehmen und den Seed am Aufnahmetag einspielen: Formulare setzen das heutige Datum als Vorgabe, und der Seed schreibt einen Teil der Sitzungen relativ zu „heute“ (Vorschläge „Wie letzte Woche“, Quartalsprognose auf dem Dashboard) – an verschiedenen Tagen weichen die Bilder sonst ohne eigene Änderung ab. Zeitabhängig sind `dashboard-prognose`, `erfassen-*`, `admin-ebm-staffel-neu-*` („Gültig ab“ mit heutigem Datum vorbelegt), `admin-*` (Demo-Account „seit“ dem Registrierungstag) und alle `demo-*` (Beispieldaten relativ zum Registrierungstag).

Der Ordner `screenshots/` ist git-ignoriert. Bei UI-PRs bitte je ein Vorher/Nachher-Bild pro betroffener Seite anhängen. Bricht der Lauf mit „Konsolenfehler“ ab, steht die Ursache in `screenshots/<label>/probleme.json` (`fehler`; `warnungen` listet zu breite Seiten).

## Releases

Releases erstellen Maintainer:innen nach [RELEASING.md](RELEASING.md): Tag setzen, das Image baut der Workflow „Release“, die Release-Notes entstehen von Hand nach der Vorlage dort.

## Lizenz deiner Beiträge

theraPiA steht unter der AGPL-3.0. Mit einem Pull Request erklärst du, dass du den Beitrag selbst erstellt hast und ihn unter dieser Lizenz einbringen darfst.

Ein Contributor License Agreement (CLA) gibt es nicht: theraPiA wird nicht zusätzlich kommerziell lizenziert, jeder Beitrag bleibt unter der AGPL-3.0. Vor größeren Beiträgen bitte kurz ein Issue eröffnen.
