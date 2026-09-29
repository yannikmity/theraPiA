# Mehrere Instanzen betreiben

Für Softwarepartner, die theraPiA für mehrere Institute bereitstellen, und für Institute mit einer zusätzlichen Test- oder Demo-Instanz. Grundlage bleibt die [Installation](installation.md); hier steht nur, was bei mehreren Instanzen dazukommt.

## Je Institut eine eigene Instanz

theraPiA kennt keine Mandanten innerhalb einer Instanz:

- Admins sehen alle Accounts der Instanz und laden in sie ein.
- Ausbildungsprofil und EBM-Staffel gelten für die ganze Instanz ([installation.md, Abschnitt 9](installation.md#9-ausbildungsregeln)).
- Feedback, Nutzungsstatistik und Backups umfassen immer die ganze Instanz.

Deshalb bekommt jedes Institut eine eigene Instanz: getrennte Datenbanken, getrennte Admins, eigene Ausbildungsregeln, eigene Backups und eine klare Zuordnung von Verantwortlichen und AVV ([datenschutz.md](datenschutz.md#rollen-klären)). Für Vorführungen und Tests eine eigene Instanz neben der produktiven betreiben – dann tauchen Test- und Demo-Accounts nie in der Account-Liste eines Instituts auf.

## Empfohlen: ein Server (oder eine VM) je Instanz

Jede Instanz läuft mit dem unveränderten Setup aus `deploy/` auf einem eigenen Server bzw. einer eigenen VM – genau wie in der [Installation](installation.md) beschrieben. So bleiben die Sicherheitsregeln aus Abschnitt 2 (nur Caddy von außen erreichbar, keine weiteren veröffentlichten Ports) ohne Anpassung gültig.

Je Instanz verschieden sein müssen:

| Was | Warum |
|---|---|
| `THERAPIA_DOMAIN` und `NEXTAUTH_URL` | eigene Adresse und eigenes Zertifikat je Institut |
| `NEXTAUTH_SECRET` | ein geteiltes Secret würde Anmelde-Cookies zwischen Instanzen gültig machen |
| `SETUP_TOKEN` | wer den Code einer Instanz kennt, könnte sonst eine andere, noch nicht eingerichtete Instanz übernehmen |
| `POSTGRES_PASSWORD` | getrennte Zugangsdaten je Datenbank |
| Ziel und Schlüssel der Backup-Kopie außer Haus | Wiederherstellung und Löschfristen je Institut ([Abschnitt 6](installation.md#6-backups)) |
| Admin-Accounts | Admins eines Instituts sehen nur dessen Accounts |
| `UMAMI_WEBSITE_ID` (falls genutzt) | Statistik je Instanz getrennt ([analytics.md](analytics.md)) |

Gleich sein dürfen die `THERAPIA_VERSION` (empfohlen, siehe unten) und die Dateien aus `deploy/`.

## Updates über mehrere Instanzen

1. Release-Hinweise einmal lesen: Migrationen, geänderte Dateien in `deploy/`, neue `.env`-Variablen ([RELEASING.md](../../RELEASING.md#vorlage-für-release-notes)).
2. Zuerst die Test- oder Demo-Instanz aktualisieren und prüfen.
3. Dann jede Instanz einzeln: Backup ([Abschnitt 5.1](installation.md#51-vorher-backup)), Update ([Abschnitt 5.2](installation.md#52-update-durchführen)), Health-Check. Geht etwas schief: [Abschnitt 5.3](installation.md#53-zurück-zur-vorigen-version-rollback).
4. Eine Liste führen, welche Instanz welche Version hat. Abfragen je Server, z. B.:

   ```bash
   ssh therapia-institut-a.example.org 'cd ~/therapia && grep THERAPIA_VERSION .env'
   curl -s https://therapia-institut-a.example.org/api/health
   ```

   Die Antwort des Health-Checks ist `{"status":"ok"}`.

Instanzen dürfen zeitweise verschiedene Versionen haben; auf Dauer sollte jede das neueste Release haben, weil nur dafür Korrekturen erscheinen ([SECURITY.md](../../SECURITY.md#unterstützte-versionen)).

## Mehrere Instanzen auf einem Server – nicht vom Projekt bereitgestellt

Das mitgelieferte Setup ist für genau eine Instanz je Server gebaut: Jede Kopie von `deploy/docker-compose.yml` startet einen eigenen Caddy, der die Ports 80 und 443 belegt – zwei Kopien auf einem Server können nicht beide starten. Wer trotzdem mehrere Instanzen auf einem Server betreiben will, braucht einen eigenen Aufbau: einen gemeinsamen Reverse Proxy für alle Domains, je Instanz einen eigenen Ordner (Docker Compose benennt Volumes und Netzwerke nach dem Ordner), keinen veröffentlichten App- oder Datenbank-Port (sonst umgeht Docker die Firewall, siehe [Abschnitt 1](installation.md#1-voraussetzungen)) und genug Arbeitsspeicher für alle Instanzen. Die Sicherheitsregeln aus [Abschnitt 2](installation.md#2-installation) – insbesondere `X-Forwarded-For` nur vom eigenen Proxy und keine zweite Content-Security-Policy – gelten dann für diesen Proxy.

Das Projekt liefert dafür keine Konfiguration und prüft sie nicht; solche Setups liegen außerhalb der [Support-Grenzen](README.md#support-grenzen).
