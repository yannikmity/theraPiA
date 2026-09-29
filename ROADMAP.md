# Roadmap

## Stand

Funktionsfähige Web-App mit PostgreSQL und Login: Stundenerfassung, Patient:innen- und Supervisor:innen-Verwaltung, Verhältnis-Anzeige, Finanzüberblick. Einträge (Therapie, Supervision, Doppelstunden, Patient:innen) lassen sich nachträglich bearbeiten und löschen. Der frühere localStorage-Prototyp und sein Umsetzungsplan sind in der Git-Historie nachvollziehbar.

Die Oberfläche läuft auf Tailwind CSS v4 und shadcn/ui mit eigenem Theme (hell/dunkel) und responsivem Layout (Seitenleiste am Desktop, Bottom-Navigation am Handy) – #3.

Für den Piloten gibt es ein Feedback-Widget (Element anpinnen, Screenshot, Admin-Ansicht) und eine optionale, cookielose Nutzungsstatistik über eine eigene Umami-Instanz.

Der Nachweis zum Unterschreiben (Druckansicht je Zeitraum und Supervisor:in), der CSV-/JSON-Export und das Löschen des eigenen Accounts sind in der Oberfläche – M3 (#7).

Betrieb: Produktions-Image, Setup mit HTTPS und Backups, Admin-Bereich mit Einladungen, Reset-Links und Sperren – M1. Ausbildungsregeln pro Instanz und Person mit datierter EBM-Staffel – M4 (#8). Demo-Zugänge mit fiktiven Beispieldaten, dokumentierter Release-Prozess und Leitfaden für Betreiber:innen – M5 (#9).

Schnellerfassung (Vorbelegung, „Wie letzte Woche“, „+ Sitzung“ von Dashboard und Patient:innen-Seite) und das Dashboard mit Stundenstand, offener Supervision und Quartalsprognose – M2 (#5, #6). Das Produktions-Image läuft in `Europe/Berlin`, Export-Dateinamen tragen den Berliner Kalendertag (#47).

## Als Nächstes

- **Betrieb auf einem echten Server testen:** Installation, Update und Rückweg nach der Betreiber-Doku durchspielen (#10)

Ideen und Prioritäten gerne als Issue einbringen.
