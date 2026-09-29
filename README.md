# theraPiA – Ausbildungs-Tracker für PiA

Open-Source-Web-App zur Erfassung von Therapie- und Supervisionsstunden für Psychotherapeut:innen in Ausbildung (PiA).

*Open-source tracker for therapy and supervision hours of psychotherapists in training (Germany). Licensed under AGPL-3.0.*

## Features

- **Dashboard** mit den drei Alltagsfragen auf einen Blick: Honorar im Quartal (bisher wie Finanzen, Prognose zum Quartalsende mit offengelegter Rechnung), Behandlungsstunden (Stand, Rest bis zum Ziel, je Kategorie) und Supervision (Stand, Rest bis zum Ziel, Verhältnis mit konkret fehlenden Einheiten, offene Supervision) – plus Fachkunde Gruppe, Verhältnis je Patient:in und letzte Einträge
- **Zählweise:** Behandlungsstunden und Supervision zählen in Einheiten zu 50 Minuten (600 Behandlungsstunden = 600 Sitzungen à 50 Min, 150 SV-Einheiten); in die Behandlungsstunden zählen alle Kategorien (Sprechstunde, Probatorik, Behandlung, Bezugsperson, Gesprächsziffer), Sprechstunde, Probatorik und Gesprächsziffern haben zusätzlich Kontingente je Fall. Doppelstunden der Gruppe zählen gesondert (60 insgesamt, davon 40 in der Ambulanzzeit), nicht in die 600. Erfasst werden Minuten, die App rechnet um; Honorar und Supervisionskosten gelten je Einheit. CSV-Exporte enthalten weiterhin Minuten und Uhrzeit-Stunden (der Ausgaben-Export rechnet wie die Finanzseite in SV-Einheiten). Ziele, Soll-Verhältnis, Gruppenziele und EBM-Staffel sind pflegbare Ausbildungsregeln (Standard: 600 Behandlungsstunden, 150 SV-Einheiten, 1 : 4, 60/40 Doppelstunden) – pro Instanz in der Administration, pro Person im Profil (siehe [docs/betrieb/installation.md](docs/betrieb/installation.md#9-ausbildungsregeln)).
- **Schnellerfassung:** Patient:in, Kategorie und Dauer vorbelegt, „Wie letzte Woche“ übernimmt die Sitzungen der Vorwoche nach einem Prüfschritt (Doppelte werden ausgelassen), „+ Sitzung“ direkt aus Dashboard und Patient:innen-Seite, Notiz nur auf Wunsch
- **Stundenerfassung** für Therapie- und Supervisionssitzungen mit Zuordnung besprochener Sitzungen
- **Patient:innen-Verwaltung** (Chiffre, Therapieart, Start-/Enddatum, Antrag: Antragsdatum, Genehmigt am und beantragte Behandlungsstunden – der Rest zählt Behandlungssitzungen ab Genehmigung (ohne Datum ab Antragsdatum) in Behandlungsstunden à 50 Min, eine 25-Minuten-Sitzung verbraucht 0,5; Sprechstunden durch die Ambulanzleitung (0–10) verkleinern das Sprechstunden-Kontingent des Falls)
- **Supervisor:innen-Verwaltung** (Name, Kosten je SV-Einheit, aktiv/inaktiv)
- **Bearbeiten und Löschen** von Therapiesitzungen (Patient:innen-Seite), Supervisionen inkl. Zuordnungen (Profil → Meine Supervisionen), Doppelstunden (Gruppe) und Patient:innen samt ihrer Sitzungen – jeweils mit Nachfrage vor dem Löschen
- **Ausbildungsregeln** pro Instanz (Administration) und pro Person (Profil), EBM-Staffel mit Gültigkeitsbeginn
- **Demo-Zugänge:** Eine Einladung mit „Mit Beispieldaten starten“ legt einen gekennzeichneten PiA-Account mit fiktiven Beispieldaten an – Dashboard, Prognose und Nachweis zeigen sofort etwas ([docs/betrieb/demo-accounts.md](docs/betrieb/demo-accounts.md))
- **Finanzen** mit Quartalsüberblick (Einnahmen, Supervisionskosten, Ergebnis) und der Einstellung „Geplante Sitzungen pro Woche“ für die Prognose
- **Profil** mit Passwort ändern, Meine Daten und Abmelden
- **Navigation:** Seitenleiste am Desktop, Bottom-Navigation am Handy (Patient:innen als eigener Tab)
- **Nachweis** zum Ausdrucken und Unterschreiben: Sitzungsliste je Zeitraum (aktuelles/letztes Quartal, Ausbildung gesamt oder frei) und optional je Supervisor:in, mit Summen, Verhältnis und Unterschriftsfeldern – Browser-Druck als A4-PDF, keine PDF-Bibliothek
- **Meine Daten** (Profil): CSV-Export je Datenart, vollständiger Datenexport als JSON (Art. 20 DSGVO) und Account selbst löschen mit Passwortbestätigung (Art. 17 DSGVO)
- **Authentifizierung** via NextAuth (E-Mail/Passwort)
- **Feedback-Widget** (Pilot): Rückmeldung zu einem konkreten Element mit optionalem Screenshot, gespeichert als Markdown + PNG auf dem Server, lesbar für Admins unter Administration → Feedback
- **Optionale Nutzungsstatistik** mit einer eigenen Umami-Instanz – cookielos, anonymisierte URLs, Standard aus ([docs/betrieb/analytics.md](docs/betrieb/analytics.md))

## Tech-Stack

- **Frontend/Backend:** Next.js 16 (App Router, Server Actions, Server Components), React 19
- **Datenbank:** PostgreSQL 15
- **Styling:** Tailwind CSS v4 (CSS-first Theme in `src/app/globals.css`, hell/dunkel) und shadcn/ui-Komponenten (Radix) in `src/components/ui`, Icons lucide-react
- **Validierung:** Zod
- **Auth:** NextAuth v5 (beta) mit Credentials Provider
- **Tests:** Vitest + Testing Library, Playwright (Screenshot-Regression)
- **Container:** Docker Compose

## Schnellstart

```bash
git clone https://github.com/yannikmity/theraPiA.git
cd theraPiA

# Umgebungsvariablen anlegen und NEXTAUTH_SECRET setzen
cp .env.example .env
# z. B.: openssl rand -base64 32

# Frontend + PostgreSQL starten
docker compose up -d --build

open http://localhost:3010
```

Beim ersten Start unter `/auth/register` den ersten Account anlegen – er wird Admin und kann weitere Personen einladen. Lokal geht das ohne Einrichtungscode, auf einem Server verlangt die App den Wert von `SETUP_TOKEN` (siehe [Installation](docs/betrieb/installation.md)). Die Migrationen in `migrations/` laufen bei jedem Start des Frontend-Containers automatisch.

## Betrieb

Für den Betrieb für andere Personen gibt es ein fertiges Container-Image und ein Setup mit HTTPS und Backups: [docs/betrieb/installation.md](docs/betrieb/installation.md). Hinweise zum Datenschutz: [docs/betrieb/datenschutz.md](docs/betrieb/datenschutz.md). Leitfaden für Betreiber:innen mit Aufgaben, Verantwortlichkeiten, Support-Grenzen und mehreren Instanzen: [docs/betrieb/README.md](docs/betrieb/README.md). Wie Releases entstehen: [RELEASING.md](RELEASING.md).

## Lokale Entwicklung (ohne Docker-Frontend)

```bash
npm install

# Nur die Datenbank starten
docker compose up -d postgres

# .env anlegen (siehe .env.example), dann:
npm run dev
```

Details zur Datenbank (pgAdmin, psql, Troubleshooting) stehen in [DOCKER_SETUP.md](DOCKER_SETUP.md).

## Tests

```bash
npm test          # Watch-Modus
npx vitest run    # einmalig
npm run shots -- --out screenshots/nachher       # Screenshot-Regression, siehe CONTRIBUTING.md
npm run shots:pdf -- --out screenshots/nachher   # Druckprüfung des Nachweises als A4-PDF (hell, dunkel, hell mit Hintergrundgrafiken)
npm run shots:fab                                # Feedback-Knopf verdeckt keinen Speichern-Knopf (echter Viewport)
```

## Projektstruktur

```
src/
  app/                    # Next.js App Router
    (app)/                # Seiten hinter dem Login, mit Seitenleiste/Bottom-Navigation
      page.tsx            # Dashboard
      sessions/new/       # Stundenerfassung
      patients/           # Patient:innen-Verwaltung
      supervisors/        # Supervisor:innen-Verwaltung
      supervision/        # Supervisionen bearbeiten und löschen
      groups/             # Gruppenfachkunde
      finances/           # Finanzen
      nachweis/           # Nachweis zum Drucken (Filter in der URL)
      profile/            # Profil, Passwort ändern, Meine Daten (Export, Account löschen)
      checklist/          # Checkliste & Tipps
      admin/              # Einladungen, Reset-Links, Sperren, Feedback lesen
    (auth)/auth/          # Login, Registrierung, Reset (ohne Navigation)
    api/                  # Auth, CSV-/Datenexport, Feedback, Healthcheck
    globals.css           # Theme-Tokens (einzige CSS-Datei)
  components/             # Projektkomponenten (ProgressBar, RatioIndicator, ...)
    analytics/            # Umami-Script (Laufzeit-Konfiguration)
    feedback/             # Feedback-Widget
    layout/               # Seitenleiste, Bottom-Navigation, Seitenkopf
    nachweis/             # Druckbares Nachweis-Dokument
    ui/                   # shadcn-Komponenten + ConfirmButton, FormField, SectionHeader
  lib/
    db/                   # Domain-Module (patients, supervisors, ...)
    services/             # Anwendungslogik (Accounts, Sitzungen, Löschen, ...)
    actions/              # seitenübergreifende Server Actions (z. B. Account löschen)
    export/               # CSV- und JSON-Export
    analytics/            # track()-Helfer, Event-Katalog, URL-Anonymisierung
    feedback/             # Datei-Store, Validierung
    csp.ts                # Content-Security-Policy mit Nonce pro Anfrage (vom Proxy gesetzt)
    calculations.ts       # Berechnungen (Stunden, Verhältnisse, Finanzen)
    validation.ts         # Zod-Schemas
    safe-action.ts        # Server-Action-Wrapper
    run-action.ts         # Client-Aufruf von Server Actions (Netzfehler → Fehlermeldung statt stiller Ablehnung)
  proxy.ts                # Anmeldeprüfung, Nonce und Content-Security-Policy für jede Anfrage
  types/                  # TypeScript-Typen
migrations/               # SQL-Migrationen
scripts/                  # Migrationen, Screenshot-Regression
```

## Umgebungsvariablen

| Variable | Beschreibung |
|----------|-------------|
| `NEXTAUTH_SECRET` | Secret für die JWT-Signierung (mind. 32 Zeichen, Pflicht; öffentlich bekannte Beispielwerte lehnt die App außerhalb von localhost ab) |
| `SETUP_TOKEN` | Einrichtungscode für den ersten Account (mind. 16 Zeichen). Lokal optional, auf einer öffentlich erreichbaren Instanz für die Einrichtung Pflicht |
| `NEXTAUTH_URL` | App-URL (Standard in der Entwicklung `http://localhost:3010`; in Produktion Pflicht und mit `https://`) |
| `DATABASE_URL` | PostgreSQL-Connection-String (nur bei `npm run dev`) |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Zugangsdaten der lokalen Datenbank |
| `REGISTRATION_MODE` | Wer sich registrieren darf: `invite` (Standard, nur mit Einladungslink), `open` (alle) oder `closed` (niemand). Der erste Account einer Instanz ist immer möglich (auf einem Server mit Einrichtungscode) und wird Admin |
| `FEEDBACK_DIR` | Ablage des Feedback-Widgets (Standard `./data/feedback`, im Container `/data/feedback`) |
| `UMAMI_SCRIPT_URL`, `UMAMI_WEBSITE_ID` | optional, nur gemeinsam: eigene Umami-Instanz für die Nutzungsstatistik |

## Datenschutz und Haftung

theraPiA verarbeitet Daten aus der psychotherapeutischen Ausbildung. Patient:innen werden nur über eine Chiffre erfasst. Klarnamen oder Diagnosen gehören nicht in die App.

Das `docker-compose.yml` im Hauptverzeichnis ist für die lokale Nutzung und Entwicklung gedacht; für den Betrieb gibt es das Setup in `deploy/` (siehe [Betrieb](#betrieb)). Wer theraPiA für andere Personen betreibt (etwa für ein Ausbildungsinstitut), ist selbst für den datenschutzkonformen Betrieb verantwortlich, insbesondere für Hosting, Verschlüsselung, Backups und Auftragsverarbeitung nach DSGVO.

Die Berechnungen von Stundenkontingenten und Verhältnissen sind eine Hilfe und ersetzen nicht die Vorgaben der Ausbildungs- und Prüfungsordnung oder des eigenen Instituts. Es gilt der Haftungsausschluss der Lizenz.

## Mitmachen

Beiträge sind willkommen – siehe [CONTRIBUTING.md](CONTRIBUTING.md). Sicherheitslücken bitte nicht als öffentliches Issue melden, sondern wie in [SECURITY.md](SECURITY.md) beschrieben.

## Lizenz

Copyright (C) 2026 Yannik Gassmann und die theraPiA-Mitwirkenden.

theraPiA steht unter der [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only). Du darfst die Software nutzen, verändern und weitergeben. Wer eine veränderte Version als Webdienst anbietet, muss den Quellcode dieser Version unter derselben Lizenz zugänglich machen.

theraPiA ist ein privates, nicht kommerzielles Projekt: Es gibt keine Bezahlversion und keine kommerziellen Lizenzen. Die Nutzung, auch durch Institute oder Dienstleister, richtet sich allein nach der AGPL-3.0.
