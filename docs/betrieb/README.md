# theraPiA betreiben – Leitfaden für Betreiber:innen

Für Ausbildungsinstitute, ihre IT und Softwarepartner, die theraPiA für Psychotherapeut:innen in Ausbildung (PiA) bereitstellen. Eine **Instanz** ist ein Setup aus dem Ordner `deploy/` mit eigener Datenbank, eigenen Accounts und eigenem Ausbildungsprofil; Zugang gibt es im empfohlenen Modus `REGISTRATION_MODE=invite` (Standard) nur per Einladung. Betreiber:in ist, wer eine Instanz aufsetzt und verantwortet.

> **Kein Rechtsrat.** Dieser Leitfaden und die Datenschutz-Checkliste helfen, an die wichtigsten Punkte zu denken. Sie ersetzen keine rechtliche Beratung und keine Abstimmung mit der zuständigen Datenschutzbeauftragten.

## Welche Anleitung wofür

| Aufgabe | Anleitung |
|---|---|
| Server vorbereiten, installieren, ersten Admin anlegen | [installation.md, Abschnitte 1–3](installation.md#1-voraussetzungen) |
| Personen einladen, Passwort zurücksetzen, Accounts sperren | [installation.md, Abschnitt 4](installation.md#4-personen-einladen) |
| Updates einspielen und zurück zur vorigen Version | [installation.md, Abschnitt 5](installation.md#5-updates) |
| Backups, Wiederherstellung, Kopie außer Haus | [installation.md, Abschnitt 6](installation.md#6-backups) |
| Fehlersuche | [installation.md, Abschnitt 7](installation.md#7-fehlersuche) |
| Feedback aus dem Widget auswerten und löschen | [installation.md, Abschnitt 8](installation.md#8-feedback-aus-dem-widget) |
| Ausbildungsregeln und EBM-Staffel der Instanz pflegen | [installation.md, Abschnitt 9](installation.md#9-ausbildungsregeln) |
| Mehrere Instanzen (mehrere Institute, Test- oder Demo-Instanz) | [mehrere-instanzen.md](mehrere-instanzen.md) |
| Demo-Zugänge mit fiktiven Beispieldaten anlegen, erkennen und löschen | [demo-accounts.md](demo-accounts.md) |
| Datenschutz: Rollen, Pflichten, Export und Löschung | [datenschutz.md](datenschutz.md) |
| Optionale Nutzungsstatistik | [analytics.md](analytics.md) |
| Mailversand für „Passwort vergessen“ | [mail.md](mail.md) |
| Wie Versionen entstehen und was die Nummern bedeuten | [RELEASING.md](../../RELEASING.md) |
| Sicherheitslücke melden | [SECURITY.md](../../SECURITY.md) |

## Aufgaben im Betrieb

**Einmalig, vor der ersten Einladung:**

- [ ] Server mit Firewall, SSH nur per Schlüssel, Setup aus `deploy/` mit fester `THERAPIA_VERSION` ([Abschnitte 1–2](installation.md#1-voraussetzungen)).
- [ ] Ersten Account mit dem Einrichtungscode (`SETUP_TOKEN`) anlegen – er wird Admin ([Abschnitt 3](installation.md#3-ersten-account-anlegen)).
- [ ] Wiederherstellung einmal testen und die Kopie der Backups außer Haus einrichten ([Abschnitt 6](installation.md#6-backups)).
- [ ] Ausbildungsprofil und EBM-Staffel mit den Vorgaben des Instituts abgleichen ([Abschnitt 9](installation.md#9-ausbildungsregeln)).
- [ ] Datenschutz-Unterlagen: Datenschutzhinweise, Verzeichnis von Verarbeitungstätigkeiten, AVV, TOMs, Impressum ([datenschutz.md](datenschutz.md)).

**Laufend:**

- [ ] Einladungen, Reset-Links, Sperren; möglichst wenige Admins ([Abschnitt 4](installation.md#4-personen-einladen)).
- [ ] Releases verfolgen (auf GitHub „Watch“ → „Custom“ → „Releases“) und zeitnah aktualisieren, immer mit Backup vorher ([Abschnitt 5](installation.md#5-updates)); Betriebssystem-Updates des Servers.
- [ ] Erreichbarkeit überwachen, z. B. `https://<domain>/api/health` aus einem Monitoring, das `{"status":"ok"}` erwartet.
- [ ] EBM-Staffel bei Änderungen des EBM ergänzen ([Abschnitt 9](installation.md#9-ausbildungsregeln)).
- [ ] Feedback auswerten und nach der festgelegten Frist löschen ([Abschnitt 8](installation.md#8-feedback-aus-dem-widget)).
- [ ] Anfragen zu Export und Löschung beantworten ([datenschutz.md](datenschutz.md#export-und-löschung)).

## Verantwortlichkeiten

| Thema | Betreiber:in | Projekt theraPiA |
|---|---|---|
| Server, Netzwerk, Firewall, Betriebssystem-Updates | verantwortlich | – |
| Installation, `.env`, Domain, HTTPS | verantwortlich | liefert das Setup in `deploy/` und die Anleitung |
| Updates: ob, wann, mit Backup vorher | verantwortlich | liefert Releases mit Hinweisen ([RELEASING.md](../../RELEASING.md)) |
| Backups, Kopie außer Haus, Wiederherstellungstests | verantwortlich | liefert Backup-Container und Anleitung |
| Accounts, Admins, Einladungen, Sperren | verantwortlich | – |
| Ausbildungsprofil und EBM-Staffel inhaltlich richtig | verantwortlich (Vorgaben des Instituts) | liefert Standardwerte und Pflegeseiten, prüft keine Institutsvorgaben |
| Datenschutz: Verantwortliche:r, Hinweise, Verzeichnis, AVV, TOMs, Betroffenenanfragen, Datenpannen | verantwortlich | liefert Export, Löschung und die Checkliste [datenschutz.md](datenschutz.md) |
| Fehler und Sicherheitslücken in der Software | meldet (Issue bzw. [SECURITY.md](../../SECURITY.md)) | behebt nach Möglichkeit in einem neuen Release |
| Zugriff auf Instanzen und Daten | allein | keiner – das Projekt betreibt keine Instanzen und sieht keine Daten |
| Lizenz (AGPL-3.0) | wer eine **veränderte** Version als Webdienst anbietet, stellt deren Quellcode bereit | stellt den Quellcode der veröffentlichten Versionen bereit |

## Support-Grenzen

- theraPiA ist ein Open-Source-Projekt ohne Vertrag: keine zugesagten Reaktionszeiten, keine Hotline, kein Betrieb von Instanzen, kein Zugriff auf Daten, keine Datenrettung. Andere Bedingungen als die AGPL-3.0 gibt es nicht: theraPiA ist ein privates, nicht kommerzielles Projekt, siehe Abschnitt „Lizenz“ in der [README](../../README.md#lizenz).
- **Fehler und Fragen** als Issue im Repository – ohne echte Daten: keine Chiffren, keine Screenshots mit Sitzungsdaten, keine Logs mit E-Mail-Adressen. Hilfreich sind die Version (`grep THERAPIA_VERSION .env`), `docker compose ps` und die relevanten Zeilen aus `docker compose logs --tail 100 app`, geschwärzt.
- **Sicherheitslücken** nie öffentlich, sondern wie in [SECURITY.md](../../SECURITY.md) beschrieben.
- **Zweckbestimmung:** theraPiA verwaltet die Ausbildung (Stunden, Supervision, Kontingente, Kosten, Nachweise) und ist kein Medizinprodukt im Sinne der MDR. Betreiber:innen dürfen die App nicht für diagnostische oder therapeutische Zwecke einsetzen, siehe [README](../../README.md#datenschutz-und-haftung).
- **Unterstützt** wird das Setup aus `deploy/` mit der jeweils neuesten Version. Abweichende Setups – ein anderer Reverse Proxy, eigene Images, Kubernetes, mehrere Instanzen auf einem Server – laufen auf eigene Verantwortung ([mehrere-instanzen.md](mehrere-instanzen.md)).
- Die Berechnungen (Stunden, Verhältnis, Kontingente, Honorar) sind eine Hilfe und ersetzen nicht die Ausbildungs- und Prüfungsordnung oder die Vorgaben des Instituts.

## Datenschutz in Kürze

Die Datenbank enthält Ausbildungsdaten mit Gesundheitsbezug – auch mit Chiffren lassen sich Rückschlüsse auf Patient:innen ziehen. Behandle sie als besondere Kategorie personenbezogener Daten (Art. 9 DSGVO). Verantwortlich ist, wer die Instanz betreibt, bei einem Institut das Institut; ein Softwarepartner, der für ein Institut betreibt, ist Auftragsverarbeiter und braucht einen AVV mit dem Institut, beide brauchen einen AVV mit dem Hoster. Technische und organisatorische Maßnahmen, Export, Löschung und Aufbewahrung: [datenschutz.md](datenschutz.md).
