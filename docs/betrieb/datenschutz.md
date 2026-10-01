# Datenschutz beim Betrieb – Checkliste

> **Kein Rechtsrat.** Diese Checkliste hilft Betreiber:innen, an die wichtigsten Punkte zu denken. Sie ersetzt keine rechtliche Beratung und keine Abstimmung mit der zuständigen Datenschutzbeauftragten. Verantwortlich für den datenschutzkonformen Betrieb ist allein, wer die Instanz betreibt.

Technische Einrichtung, Updates und Backups: siehe [installation.md](installation.md).

## Welche Daten die App verarbeitet

- [ ] **Account-Daten:** Name, E-Mail-Adresse, Passwort (nur als bcrypt-Hash), Rolle (Admin oder PiA), Sperrstatus, Kennzeichen Demo-Account. Einladungen enthalten optional die Adresse der eingeladenen Person und ob der Account mit Beispieldaten startet; bei nicht eingelösten Einladungen entfernt die App die Adresse 30 Tage nach Ablauf des Links (beim nächsten Öffnen der Administration), bei eingelösten ist sie die Adresse des Accounts.
- [ ] **Ausbildungsdaten:** Datum und Dauer von Therapie- und Supervisionssitzungen, Namen der Supervisor:innen, Supervisionskosten, Vergütung und daraus berechnete Finanzübersichten.
- [ ] **Patient:innen nur als Chiffre**, dazu Therapieart sowie Start- und Enddatum. Die App fragt keine Klarnamen, Geburtsdaten oder Diagnosen ab.
- [ ] **Gruppentherapie:** Gruppen (frei wählbarer Name, Startdatum, geplante Sitzungszahl, durchschnittliche Teilnehmendenzahl) und Gruppensitzungen (Datum, Dauer, Status, Zahl der Teilnehmenden, Notizfeld).
- [ ] **Antrags- und Kontingentdaten** je Patient:in: Antragsdatum, Genehmigungsdatum, beantragte Behandlungsstunden (Einheiten à 50 Minuten) und die Zahl der Sprechstunden, die die Ambulanzleitung übernommen hat.
- [ ] **Persönliche Ausbildungsregeln:** Wer unter Profil → Meine Ausbildungsregeln eigene Stundenziele, ein eigenes Soll-Verhältnis oder eigene Gruppenziele festlegt, speichert diese Werte zum Account. Das Ausbildungsprofil der Instanz und die EBM-Staffel (Administration) enthalten keine personenbezogenen Daten.
- [ ] **Notizfelder und Gruppennamen:** Freitext kann trotzdem Personenbezug oder Gesundheitsdaten enthalten. Notizen und Gruppennamen dürfen **keine Klarnamen und keine Diagnosen** enthalten. Weise alle Nutzer:innen in der Einladung darauf hin und nimm es in die Datenschutzhinweise auf.
- [ ] **Technisch:** Die App setzt nur technisch notwendige Cookies für die Anmeldung; das Anmelde-Cookie läuft nach 7 Tagen ohne Nutzung ab. Eine Nutzungsstatistik gibt es nur, wenn die Betreiber:in sie ausdrücklich mit einer eigenen Umami-Instanz einschaltet (siehe [unten](#optionale-nutzungsstatistik-umami)). Caddy und Docker schreiben Zugriffs- und Fehlerprotokolle mit IP-Adressen auf den Server; lege fest, wie lange sie aufbewahrt werden.
- [ ] **Feedback-Widget:** Rückmeldungen aus der App mit optionalem Screenshot, gespeichert als Dateien auf dem Server (siehe [Abschnitt „Feedback-Widget“](#feedback-widget)).
- [ ] **Demo-Zugänge:** Accounts, die über eine Einladung „Mit Beispieldaten starten“ entstehen, enthalten fiktive Beispieldaten, aber echten Namen und echte E-Mail-Adresse der Person. Nach der Vorführung löschen; für Vorführungen bei Dritten eine eigene Instanz nutzen (siehe [demo-accounts.md](demo-accounts.md)).

Auch mit Chiffren können Ausbildungsdaten Rückschlüsse auf Patient:innen zulassen (z. B. Sitzungstermine). Behandle die gesamte Datenbank als besonders schutzwürdig (Gesundheitsbezug, Art. 9 DSGVO).

## Rollen klären

- [ ] **Betreiber:in = Verantwortliche:r** (Art. 4 Nr. 7 DSGVO) – bei einer Instanz für den Freundeskreis die Person, die sie betreibt; bei einer Instanz für ein Ausbildungsinstitut das Institut.
- [ ] **Betrieb im Auftrag:** Betreibt ein Dienstleister die Instanz für ein Institut, ist das Institut verantwortlich und der Dienstleister Auftragsverarbeiter → Vertrag zur Auftragsverarbeitung (AVV, Art. 28 DSGVO) zwischen beiden.
- [ ] **Mehrere Institute:** Betreibt ein Softwarepartner Instanzen für mehrere Institute, bekommt jedes Institut eine eigene Instanz und einen eigenen AVV; Daten verschiedener Institute liegen nie in derselben Instanz (siehe [mehrere-instanzen.md](mehrere-instanzen.md)).
- [ ] **Hoster = Auftragsverarbeiter** → AVV mit dem Hoster abschließen (bei großen Hostern meist im Kundenmenü). **Server in der EU** wählen, ebenso den Speicher für externe Backups.

## Pflichten der Betreiber:in

- [ ] **Datenschutzhinweise** für Nutzer:innen (Art. 13 DSGVO): welche Daten, wozu, wer betreibt, wo gehostet, wie lange gespeichert, Rechte der Nutzer:innen, Kontakt. Vor der ersten Einladung bereitstellen.
- [ ] **Verzeichnis von Verarbeitungstätigkeiten** (Art. 30 DSGVO) um die Verarbeitung „Ausbildungsnachweise mit theraPiA“ ergänzen.
- [ ] **Technische und organisatorische Maßnahmen (TOMs, Art. 32 DSGVO)** dokumentieren und umsetzen:
  - [ ] Verschlüsselung bei der Übertragung: HTTPS über Caddy/TLS (im Setup enthalten).
  - [ ] Verschlüsselung der Festplatten beim Hoster (Verschlüsselung ruhender Daten) – beim Hoster nachfragen oder selbst einrichten.
  - [ ] Backups verschlüsselt außer Haus (siehe [installation.md, Abschnitt 6](installation.md#6-backups)); die lokalen Backups auf dem Server sind nicht verschlüsselt.
  - [ ] Zugriff auf den Server nur per SSH-Schlüssel, Firewall nur mit Ports 22, 80 und 443, Datenbank und App-Port nicht öffentlich (siehe [installation.md, Abschnitt 1](installation.md#1-voraussetzungen)).
  - [ ] Zeitnahe Updates von theraPiA und vom Betriebssystem (z. B. `unattended-upgrades` unter Ubuntu/Debian).
  - [ ] Möglichst wenige Admins; Einladungs- und Reset-Links nur vertraulich weitergeben.
- [ ] **Datenpannen:** Vorgehen festlegen (Meldung an die Aufsichtsbehörde binnen 72 Stunden, Art. 33 DSGVO).

## Export und Löschung

- [ ] **Datenexport (Art. 20 DSGVO):** Jede Person lädt ihre Daten selbst herunter – unter **Profil → Meine Daten**: eine JSON-Datei mit allen Daten (Form siehe unten) oder CSV je Datenart (Therapiesitzungen, Supervisionen, Doppelstunden, Patient:innen, Ausgaben; für Excel mit deutschen Ländereinstellungen). Die Ausgaben gibt es zusätzlich unter **Finanzen**, wahlweise für ein Kalenderjahr. Die Adressen dahinter (`/api/account/export`, `/api/export/csv/therapy-sessions`, `…/supervisions`, `…/group-sessions`, `…/patients`, `…/expenses`, optional `…/expenses?jahr=JJJJ`) verlangen eine gültige Anmeldung; ohne Sitzung antwortet die App mit `401`. Exporte enthalten weder Passwort-Hashes noch Einladungs- oder Reset-Tokens.
- [ ] **Sofort sperren:** Verlässt eine Person die Instanz oder wird ein Account missbraucht, sperrt ein Admin ihn unter Profil → Administration. Anmelden ist dann nicht mehr möglich; die Daten bleiben erhalten.
- [ ] **Vollständig löschen (Art. 17 DSGVO):** Jede Person löscht ihren Account selbst: Passwort erneut eingeben, dann werden mit dem Account alle Daten gelöscht – Patient:innen-Chiffren, Sitzungen, Gruppen und Doppelstunden, Supervisor:innen, Finanzen, persönliche Ausbildungsregeln, Reset-Links. Feedback, das die Person über das Feedback-Widget gegeben hat (Markdown-Dateien und Screenshots im Feedback-Ordner, siehe [Abschnitt „Feedback-Widget“](#feedback-widget)), wird dabei ebenfalls gelöscht; schlägt das fehl, steht die `user_id` im App-Log (`docker compose logs app`), dann die Dateien mit dieser `user_id` im Frontmatter von Hand entfernen. Von der Person erzeugte oder eingelöste Einladungen bleiben ohne Bezug zur Person bestehen; aus den von ihr eingelösten und aus allen Einladungen an ihre Adresse (offen oder verbraucht) wird ihre E-Mail-Adresse entfernt (die Adresse in einer von ihr erzeugten Einladung gehört der eingeladenen Person und bleibt). Bestehende Anmeldungen der Person sind sofort ungültig. Der letzte aktive Admin kann sich nicht löschen – vorher eine zweite Person als Admin einladen. Vorher auf Wunsch der Person exportieren (siehe oben). Weg: **Profil → Meine Daten → Account löschen** – Passwort eingeben, Nachfrage bestätigen; danach ist die Person abgemeldet und sieht auf der Anmeldeseite „Account gelöscht“. Kann sich die Person nicht mehr anmelden, setzt ein Admin zuerst einen Reset-Link (Profil → Administration), ein gesperrter Account muss vorher entsperrt werden – danach löscht die Person selbst.
- [ ] **Notfallweg für Betreiber:innen (SQL):** Normalfall ist die Löschung durch die Person selbst (oben). Nur wenn das nicht geht – etwa weil die Person nicht mehr erreichbar ist und kein Reset-Link zustellbar –, setzt ein Admin den Löschwunsch per SQL auf dem Server um (im Ordner der Installation):

  ```bash
  docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
  ```

  ```sql
  BEGIN;
  UPDATE invitations SET email = NULL
    WHERE used_by = (SELECT id FROM users WHERE email = lower('pia@example.com'))
       OR lower(email) = lower('pia@example.com');
  DELETE FROM users WHERE email = lower('pia@example.com');
  COMMIT;
  ```

  Die Adresse an allen drei Stellen gleich eintragen; die App speichert E-Mail-Adressen kleingeschrieben, `lower(…)` gleicht Groß-/Kleinschreibung der Eingabe aus. Das `DELETE` muss `DELETE 1` melden, sonst `ROLLBACK;` statt `COMMIT;`. Das Ergebnis entspricht der Löschung durch die Person selbst: Fachdaten und Reset-Links werden über die Fremdschlüssel gelöscht, aus den von ihr eingelösten und aus allen Einladungen an ihre Adresse (offen oder verbraucht) verschwindet die E-Mail-Adresse der Person. Anders als die App prüft SQL nicht, ob der letzte aktive Admin gelöscht wird – das vorher selbst prüfen. Der SQL-Weg löscht keine Feedback-Dateien – im Feedback-Ordner nach `user_id: "<id>"` suchen (`grep -l` in `/data/feedback`, siehe [installation.md, Abschnitt 8](installation.md#8-feedback-aus-dem-widget)) und die `.md`- und `.png`-Dateien löschen. Einen Export vorher kann nur die Person selbst ziehen (Profil → Meine Daten).
- [ ] **Backups:** Gelöschte Daten bleiben in den Backups, bis diese herausrotieren – spätestens nach 6 Monaten (monatliche Backups, siehe [installation.md, Abschnitt 6](installation.md#6-backups)); für externe Backup-Kopien eine gleich lange Aufbewahrung einstellen. Das in den Datenschutzhinweisen nennen.

### Form des Datenexports (JSON)

Eine Datei `therapia-datenexport-JJJJ-MM-TT.json`, UTF-8. Feldnamen wie in der App (englisch, camelCase), damit Export und Software nicht auseinanderlaufen. `format` und `version` kennzeichnen die Form; ändern sich Felder, steigt `version`.

| Feld | Inhalt |
|---|---|
| `format`, `version`, `exportedAt` | `"therapia-datenexport"`, `3`, Zeitstempel des Exports (ISO 8601, UTC) |
| `account` | `id`, `email`, `name`, `role` (`admin` oder `pia`), `createdAt` – kein Passwort-Hash |
| `patients` | je `id`, `chiffre`, `therapyType`, `startDate`, `endDate`, `isActive`, `createdAt`, `antragsdatum`, `genehmigungsdatum`, `beantragteStunden`, `sprechstundenAmbulanz` |
| `supervisors` | je `id`, `name`, `costPerHour`, `isActive` |
| `therapySessions` | je `id`, `patientId`, `date`, `durationMinutes`, `notes`, `category` |
| `supervisionSessions` | je `id`, `supervisorId`, `date`, `durationMinutes`, `kind`, `linkedTherapySessionIds`, `linkedGroupSessionIds` |
| `groups` | je `id`, `name`, `startDate`, `plannedSessionCount`, `avgKids`, `isActive`, `createdAt` |
| `groupSessions` | je `id`, `groupId`, `date`, `status`, `childCount`, `countsTowardAmbulanzzeit`, `durationMinutes`, `notes` |
| `financialSettings` | `incomePerHour` |
| `ausbildungsregelnAbweichungen` | persönliche Ausbildungsregeln oder `null`: `behandlungsstundenZiel`, `svEinheitenZiel`, `verhaeltnisWarnung`, `verhaeltnisKritisch`, `gruppeDoppelstundenZiel`, `gruppeAmbulanzzeitZiel` – je Zahl oder `null` (erbt vom Ausbildungsprofil) |
| `createdInvitations` | von der Person erzeugte Einladungen: `email`, `role`, `createdAt`, `expiresAt`, `usedAt` – ohne Token |

Datumsfelder sind `JJJJ-MM-TT`, Zeitstempel ISO 8601. Nicht enthalten: Passwort-Hash, Reset-Links, Einladungs-Tokens, Server-Protokolle (Caddy/Docker, siehe oben) und Feedback aus dem Widget – auf Anfrage stellt ein Admin die Dateien der Person aus dem Feedback-Ordner bereit (siehe [Feedback-Widget](#feedback-widget)).

### Form der CSV-Dateien

Eine Datei je Datenart: Semikolon-getrennt, UTF-8 mit BOM, Zeilenende CRLF, Datum `JJJJ-MM-TT` (Excel erkennt das als Datum), Dauer als Minuten und als Uhrzeit-Stunden mit Dezimalkomma (Minuten ÷ 60, Rohdaten – anders als die Behandlungsstunden und SV-Einheiten à 50 Min in der App), Ja/Nein-Felder als `ja`/`nein`. Jedes Textfeld (auch Namen und Chiffren), das mit `=`, `+`, `-`, `@`, einem Tabulator oder einem Wagenrücklauf (CR) beginnt, bekommt ein vorangestelltes Hochkomma (`'`), damit Tabellenkalkulationen ihn nicht als Formel ausführen.

| Datei | Spalten |
|---|---|
| `therapia-therapiesitzungen-….csv` | Datum; Chiffre; Kategorie; Dauer (Minuten); Dauer (Stunden); Notiz; Supervision am; Supervisor:in |
| `therapia-supervisionen-….csv` | Datum; Supervisor:in; Art; Dauer (Minuten); Dauer (Stunden); Besprochene Sitzungen; Besprochene Doppelstunden |
| `therapia-doppelstunden-….csv` | Datum; Gruppe; Status; Teilnehmende; Zählt zur Ambulanzzeit; Dauer (Minuten); Dauer (Stunden); Notiz; Supervision am; Supervisor:in |
| `therapia-patientinnen-….csv` | Chiffre; Therapieart; Beginn; Ende; Aktiv; Antragsdatum; Genehmigungsdatum; Beantragte Behandlungsstunden; Sprechstunden durch Ambulanzleitung; Sitzungen (Anzahl); Sitzungen (Stunden) |
| `therapia-ausgaben-….csv`, mit Jahr `therapia-ausgaben-JJJJ-stand-….csv` | Datum; Quartal; Supervisor:in; Art; Dauer (Minuten); SV-Einheiten; Kosten je SV-Einheit (EUR); Betrag (EUR) – letzte Zeile „Summe“ |

Die Spalten „Dauer (Stunden)“ und „Sitzungen (Stunden)“ sind Uhrzeit-Stunden (Minuten ÷ 60) als Rohdaten. Sie sind nicht die Behandlungsstunden und SV-Einheiten à 50 Minuten, mit denen die App die Ausbildung zählt; umrechnen lässt sich das jederzeit aus der Spalte „Dauer (Minuten)“. Ausnahme ist die Ausgaben-Datei: Sie rechnet wie die Finanzseite in SV-Einheiten à 50 Minuten (Einheiten mal Kosten je SV-Einheit), rundet jeden Betrag auf Cent und addiert in der Summenzeile die gerundeten Beträge. Die Summe kann daher um wenige Cent von der auf Euro gerundeten Kachel „Ausgaben“ abweichen.

## Feedback-Widget

Angemeldete Nutzer:innen können über den Knopf „Feedback“ Rückmeldungen zu einzelnen Stellen der App geben. Gespeichert wird je Feedback: Freitext, Bewertung (gefällt mir / stört mich / Wunsch), die Seite (Pfad) und das angeklickte Element (Beschriftung und technischer Pfad), Bildschirmgröße, Browser-Kennung (User-Agent), Zeitpunkt sowie Name, E-Mail-Adresse und Account-ID der Person – und, wenn sie das Häkchen „Screenshot anhängen“ nicht entfernt, ein Bild des gerade sichtbaren Bildschirmausschnitts. Die Person wird dabei immer aus der Anmeldung auf dem Server bestimmt, nicht aus Angaben des Browsers.

- [ ] **Screenshots können Chiffren, Sitzungsdaten und Notizen zeigen.** Das Widget weist darauf hin, zeigt eine Vorschau und lässt den Screenshot abwählen. Gelingt die Aufnahme nicht innerhalb von 10 Sekunden oder ist das Bild größer als 8 MB, wird das Feedback ohne Screenshot gespeichert. Behandle den Feedback-Ordner wie die Datenbank (Gesundheitsbezug).
- [ ] **Wo:** als Dateien im Docker-Volume `feedback_data` auf dem Server (kein externer Dienst, keine Weitergabe an Dritte, keine Issue-Tracker-Spiegelung). Nicht Teil des Datenbank-Backups.
- [ ] **Wer liest:** nur Admins der Instanz (Profil → Administration → Feedback) und wer Zugriff auf den Server hat.
- [ ] **Aufbewahrung:** Lege eine Frist fest (z. B. Ende der Pilotphase oder 90 Tage nach Eingang) und lösche die Dateien danach ([installation.md, Abschnitt 8](installation.md#8-feedback-aus-dem-widget)). Löscht eine Person ihren Account, werden ihre Feedback-Dateien mitgelöscht – nach der Löschung in der Datenbank; schlägt das Löschen der Dateien fehl, bleibt die Account-Löschung gültig und das App-Log nennt die `user_id` zum Nachräumen (siehe [Export und Löschung](#export-und-löschung)).
- [ ] **Datenschutzhinweise:** Zweck (Verbesserung der App im Pilot), gespeicherte Daten, Screenshot-Option und Frist aufnehmen. Weise Nutzer:innen darauf hin, im Feedback-Text keine Klarnamen zu nennen.

## Mailversand (Passwort vergessen)

Standard: aus. Mit eingerichtetem SMTP-Zugang ([mail.md](mail.md)) schickt die App auf Anfrage einen Link zum Zurücksetzen des Passworts an die Adresse des Kontos. Die Mail enthält nur den Link und einen Hinweistext – keinen Namen, keine Gesundheitsdaten.

- [ ] Der Mail-Anbieter verarbeitet E-Mail-Adresse, Zeitpunkt und Link: AVV abschließen, Anbieter mit Sitz bzw. Verarbeitung in der EU wählen.
- [ ] Verarbeitung in Datenschutzhinweise und Verzeichnis von Verarbeitungstätigkeiten aufnehmen (Zweck: Zugang wiederherstellen).
- [ ] Aufbewahrung im Versandprotokoll des Anbieters möglichst kurz einstellen.
- [ ] Ausschalten: SMTP-Werte, `MAIL_FROM` und `MAIL_REPLY_TO` entfernen, `docker compose up -d` ([mail.md](mail.md#ausschalten)).

## Optionale Nutzungsstatistik (Umami)

Standard: aus. Wer eine eigene Umami-Instanz einschaltet (`UMAMI_SCRIPT_URL`, `UMAMI_WEBSITE_ID`), sendet bei jedem Seitenaufruf und wenigen Ereignissen anonymisierte Daten an diese Instanz – ohne Cookies, ohne Namen, Adressen, Chiffren oder Datensatz-IDs, ohne Query-String und Seitentitel; welche genau, steht in [analytics.md](analytics.md).

- [ ] Umami-Instanz in der EU betreiben (bzw. AVV mit dem Hoster); sie ist Teil der Verarbeitung.
- [ ] Verarbeitung in die Datenschutzhinweise und das Verzeichnis von Verarbeitungstätigkeiten aufnehmen (Rechtsgrundlage klären, z. B. berechtigtes Interesse am Betrieb – kein Rechtsrat).
- [ ] Die Browser-Einstellung „Do Not Track“ wird respektiert (dann sendet die App nichts); Aufbewahrung in Umami einstellen.
- [ ] Ausschalten: beide Variablen entfernen, `docker compose up -d`.

## Nicht Teil der App

- [ ] **Impressum und Datenschutzerklärung** stellt die Betreiber:in selbst bereit (z. B. auf der eigenen Website) und verlinkt sie in der Einladung. theraPiA bringt keine eigenen Seiten dafür mit.
