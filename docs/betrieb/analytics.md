# Optionale Nutzungsstatistik mit Umami

theraPiA kann Seitenaufrufe und wenige Ereignisse an eine **eigene, selbst betriebene [Umami](https://umami.is)-Instanz** senden. Standard ist **aus**: Ohne Konfiguration lädt die App kein Statistik-Script und ändert ihre Content-Security-Policy nicht. Umami arbeitet ohne Cookies und ohne Fingerprinting über Seiten hinweg; Besucher:innen werden aus IP-Adresse, Browser und Website-ID mit einem regelmäßig wechselnden Salt gehasht, die IP-Adresse wird nicht gespeichert.

## Einschalten

1. In der Umami-Instanz eine Website anlegen (Name, Domain der theraPiA-Instanz). Die **Website-ID** (UUID) steht in der URL `…/websites/<UUID>` bzw. unter Settings → Websites → Edit.
2. In der `.env` der Installation beide Werte setzen (nur gemeinsam, sonst startet die App nicht; `docker compose logs app` nennt dann die Ursache):

   ```
   UMAMI_SCRIPT_URL=https://analytics.example.net/script.js
   UMAMI_WEBSITE_ID=11111111-1111-4111-8111-111111111111
   ```

3. `docker compose up -d`. Prüfen: Seitenquelltext enthält `script.js` der Instanz; im Netzwerk-Tab des Browsers antwortet `POST …/api/send` mit 200; im Umami-Dashboard erscheinen Aufrufe mit einigen Minuten Verzögerung.

Die Werte werden **zur Laufzeit** gelesen – das Image ist für alle Betreiber:innen gleich. Die Content-Security-Policy setzt die App auf jeder Antwort (auch bei Umleitungen, `401`, statischen Dateien und `404`), mit einer neuen Nonce pro Anfrage; das Umami-Script bekommt diese Nonce. Mit Umami erweitert die App die Policy automatisch um die **Origin** der Script-URL – in `script-src` (Laden des Scripts) und `connect-src` (`POST …/api/send`) –, sonst nichts. Liegt das Script auf einer anderen Origin als der Endpunkt `/api/send` (z. B. über ein eigenes CDN), blockiert der Browser die Aufrufe; Script und Instanz müssen unter derselben Origin erreichbar sein. Ohne Umami enthält die Policy keine fremde Origin.

## Was gesendet wird

Bei jedem Seitenaufruf (auch bei Navigation innerhalb der App) und bei jedem Ereignis: Website-ID, Hostname der Instanz, Bildschirmgröße, Browsersprache, **anonymisierte URL** und anonymisierter Referrer.

- **URL:** immer nur der Pfad der aktuellen Seite, ohne Domain. Datensatz-IDs im Pfad – UUIDs und Feedback-IDs – werden durch `[id]` ersetzt (`/patients/[id]`, `/admin/feedback/[id]`). Query-String und Fragment entfallen (dort stehen Einladungs- und Reset-Links).
- **Referrer:** bei Navigation innerhalb der App die eigene Adresse der App plus der anonymisierte Pfad der vorherigen Seite (z. B. `https://therapia.example.net/patients/[id]`); beim ersten Aufruf der Verweis des Browsers – eine eigene Seite ebenso als eigene Adresse plus anonymisierter Pfad, eine fremde Seite nur als Origin (z. B. `https://example.org`).
- **Nicht gesendet:** der Seitentitel, Namen, E-Mail-Adressen, Chiffren, Notizen, Element-Beschriftungen und Fehlermeldungen. Umami setzt keine Cookies.
- **Do Not Track:** Die Browser-Einstellung „Do Not Track“ wird respektiert – dann wird nichts gesendet, weder Seitenaufrufe noch Ereignisse.

## Ereignisse (Event-Katalog)

| Event | Wann | Eigenschaften |
|---|---|---|
| `login_success` | Anmeldung erfolgreich | – |
| `login_failed` | Anmeldung abgelehnt | `reason`: `credentials`, `rate_limited` oder `unavailable` |
| `therapy_session_saved` | Therapiesitzung angelegt oder bearbeitet | `mode`: `new` oder `edit` |
| `supervision_saved` | Supervision angelegt oder bearbeitet | `mode`: `new`/`edit`; `kind`: `individual`/`group` |
| `patient_created` | Patient:in angelegt | – |
| `entry_deleted` | Eintrag gelöscht | `entity`: `therapy_session`, `supervision`, `group_session` oder `patient` |
| `action_failed` | Eine Speichern-/Löschen-Aktion wurde vom Server abgelehnt | `entity` (wie oben), `action`: `create`/`update`/`delete`, `category`: `validation` (Eingabefehler) oder `error` |
| `feedback_opened` | Feedback-Widget gestartet | – |
| `feedback_saved` | Feedback gespeichert | `sentiment`: `positiv`/`negativ`/`wunsch`; `screenshot`: `true`/`false` |
| `nachweis_printed` | Druckdialog für den Nachweis geöffnet | `supervisor`: `true` (auf eine Supervisor:in gefiltert) oder `false` |
| `export_downloaded` | Download unter Profil → Meine Daten oder (Ausgaben) unter Finanzen gestartet | `entity`: `therapy_sessions`, `supervisions`, `group_sessions`, `patients`, `expenses` (CSV) oder `json` (Datenexport) |
| `account_deleted` | Eigener Account gelöscht (gesendet vor dem Abmelden) | – |
| `quick_capture_used` | Schnelleinstieg „+ Sitzung“ mit vorgewählter Patient:in angetippt | `source`: `dashboard` (Patient:innen-Zeile auf dem Dashboard) oder `patient` (Kopf der Patient:innen-Seite) |
| `last_week_suggestions_applied` | Vorschläge „Wie letzte Woche“ gespeichert | `count`: Anzahl der gespeicherten Sitzungen (Zahl, keine IDs) |
| `dashboard_forecast_viewed` | Annahmen der Quartalsprognose auf dem Dashboard aufgeklappt | – |

Andere Eigenschaften lässt der Code nicht zu: Erlaubt sind nur diese festen Werte und Anzahlen, nie IDs, Chiffren, Namen oder Freitext. Zweck: erkennen, **wo** Nutzer:innen scheitern (Anmeldung, Speichern), und ob die Kernfunktionen genutzt werden. Neue Events zuerst hier eintragen, dann in `src/lib/analytics/track.ts` (`EVENTS`, die erlaubten Eigenschaften in `EventProps` und – zur Laufzeit geprüft – in `EVENT_FIELDS`; alles andere wird vor dem Senden verworfen).

## Ausschalten und Datenschutz

Beide Variablen aus der `.env` entfernen (oder leer lassen) und `docker compose up -d` – ab dann lädt die App kein Script mehr und sendet nichts. Bereits erhobene Daten liegen nur in der Umami-Instanz; Aufbewahrung und Löschung richten sich nach deren Einstellungen. Wer Umami einschaltet, nimmt die Verarbeitung in die Datenschutzhinweise auf (siehe [datenschutz.md](datenschutz.md#optionale-nutzungsstatistik-umami), Abschnitt „Optionale Nutzungsstatistik“).
