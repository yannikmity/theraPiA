# Releases erstellen

Für Maintainer:innen von theraPiA. Betreiber:innen finden Update und Rückweg in [docs/betrieb/installation.md, Abschnitt 5](docs/betrieb/installation.md#5-updates).

Ein Release besteht aus drei Teilen: einem Git-Tag, dem Container-Image in der GitHub Container Registry (GHCR) und den Release-Notes auf der Releases-Seite des Repositorys. Tag und Image hängen automatisch zusammen, die Release-Notes schreibt eine Maintainer:in von Hand.

| Schritt | Wie | Automatisch |
|---|---|---|
| Tag `vX.Y.Z` auf `master` setzen und pushen | `git tag -a …`, `git push origin vX.Y.Z` | nein |
| Lint, Tests, Build, Docker-Bau | Workflow „Release“ (`.github/workflows/release.yml`), Job `ci` – ruft `.github/workflows/ci.yml` auf | ja |
| Image für `linux/amd64` und `linux/arm64` bauen und nach `ghcr.io/<owner>/therapia` pushen | Workflow „Release“, Job `image`, nur nach grünem `ci` | ja |
| Release-Notes veröffentlichen | GitHub-Release zum Tag | nein |
| Versionsnummer in `package.json` | wird nicht gepflegt: steht auf `0.1.0`, weder App noch Workflow lesen sie. Maßgeblich sind Tag und Image-Tag. | – |

**Stand (September 2026):** Zu den Tags `v0.2.0` bis `v0.7.0` gibt es keine GitHub-Releases, nur einzeilige Tag-Nachrichten. Ab dem nächsten Release gilt der Ablauf unten.

## Versionsschema

- **Git-Tags:** `v` plus Semver – `v0.8.0`, `v0.8.1`, Vorabversionen wie `v1.0.0-rc.1`. Der Workflow „Release“ startet nur bei Tags nach `v[0-9]+.[0-9]+.[0-9]+` oder `v[0-9]+.[0-9]+.[0-9]+-*`; andere Tags (etwa `v-test`) bauen nichts.
- **Image-Tags** (erzeugt von `docker/metadata-action` mit `type=semver,pattern={{version}}`, `type=semver,pattern={{major}}.{{minor}}` und `latest=auto`):

  | Git-Tag | Image-Tags |
  |---|---|
  | `v0.8.0` | `0.8.0`, `0.8`, `latest` |
  | `v0.8.1` | `0.8.1`, `0.8`, `latest` |
  | `v1.0.0-rc.1` | nur `1.0.0-rc.1` |

- **`latest` wandert mit jedem regulären Release**, das gebaut wird – auch mit einem Patch für eine ältere Linie (z. B. `v0.7.1` nach `v0.8.0`). Betreiber:innen setzen deshalb `THERAPIA_VERSION` auf eine volle Versionsnummer ([installation.md, Abschnitt 2](docs/betrieb/installation.md#2-installation)); `latest` nur zum Ausprobieren.
- **Welche Nummer? (Empfehlung, bisher nicht einheitlich gehandhabt)** Patch: Korrekturen ohne Datenbank-Migration und ohne geänderte Dateien in `deploy/`. Minor: neue Funktionen, jede neue Migration, geänderte `deploy/`-Dateien oder neue `.env`-Variablen – so sehen Betreiber:innen schon an der Nummer, dass sie die Hinweise lesen müssen. Major: `1.0.0` als erste für den Regelbetrieb freigegebene Version, danach Änderungen, die Betreiber:innen aktiv umstellen müssen.

## Was beim Start eines neuen Images passiert

Der Container startet mit `node scripts/migrate.mjs && exec node server.js` (siehe `Dockerfile`). Bei **jedem** Start wendet `scripts/migrate.mjs` alle Dateien aus `migrations/` an, die noch nicht in der Tabelle `schema_migrations` stehen – in Reihenfolge der Dateinamen, jede in einer eigenen Transaktion, unter einer Advisory-Sperre (mehrere Container warten aufeinander). Scheitert eine Migration, wird sie zurückgerollt, das Skript endet mit Exit-Code 1, der Server startet nicht; mit `restart: unless-stopped` (`deploy/docker-compose.yml`) startet Docker den Container immer wieder, das Log zeigt `Migration … fehlgeschlagen: …`. Einträge in `schema_migrations`, zu denen das Image keine Datei hat, übergeht das Skript.

Daraus folgt für Releases:

- Migrationen laufen nur vorwärts; Rückwärts-Migrationen gibt es nicht. Eine veröffentlichte Migrationsdatei nie ändern oder umbenennen – `schema_migrations` merkt sich nur den Dateinamen; Korrekturen kommen als neue Datei.
- Migrationen möglichst **additiv** schreiben (neue Tabellen, neue Spalten mit Standardwert oder ohne Pflichtwert, wie 004 bis 007). Dann läuft auch das vorige Image mit der migrierten Datenbank, und Betreiber:innen kommen ohne Backup zurück. Nicht additive Migrationen in den Release-Notes ausdrücklich nennen („Rückweg nur mit Backup“).
- Jede neue Migration bekommt einen Test des Update-Pfads auf einer befüllten Datenbank (Muster: `src/lib/__tests__/migration-006.test.ts`); die CI führt ihn mit `npx vitest run` aus.

## Ablauf

### 1. Vorbereiten

- `master` ist in der CI grün (Reiter „Actions“, Workflow „CI“).
- Änderungen seit dem letzten Tag ansehen:

  ```bash
  git fetch --tags origin
  LETZTER=$(git describe --tags --abbrev=0 origin/master)
  git log --oneline "$LETZTER"..origin/master
  git diff --stat "$LETZTER"..origin/master -- migrations/ deploy/ Dockerfile
  ```

  Die Liste der Commits ist die Grundlage der Release-Notes; zeigt der zweite Befehl Dateien, gehören sie in den Abschnitt „Für Betreiber:innen“ und die Nummer wird nach der Empfehlung oben mindestens Minor.
- Bei Änderungen an der Oberfläche die Screenshot-Regression nach [CONTRIBUTING.md](CONTRIBUTING.md#oberfläche-ändern-screenshot-regression) laufen lassen.
- Dependabot öffnet Pull Requests für Abhängigkeiten; sie landen wie jeder andere Merge auf `master` und erst mit dem nächsten Tag in einem Image.

### 2. Release-Notes entwerfen

Nach der [Vorlage unten](#vorlage-für-release-notes), in einer Datei außerhalb des Repositorys (z. B. `release-notes.md` im Home-Verzeichnis) oder direkt im Browser.

### 3. Tag setzen

```bash
git switch master
git pull --ff-only
git tag -a v0.8.0 -m "v0.8.0 – kurze Zusammenfassung mit Issue-Nummern"
git push origin v0.8.0
```

Annotierte Tags mit einer Zeile Zusammenfassung, wie bei den bisherigen Tags. Einen gepushten Tag nie verschieben oder neu vergeben: Betreiber:innen laden die Dateien aus `deploy/` über den Tag herunter ([installation.md, Abschnitt 2](docs/betrieb/installation.md#2-installation)).

### 4. Workflow beobachten

```bash
gh run list --workflow release.yml --limit 1
gh run watch
```

Oder im Reiter „Actions“. Erst läuft `ci` (Lint, Tests mit PostgreSQL 15, Build, Docker-Bau), danach `image`. Ist `ci` rot, entsteht kein Image.

### 5. Image prüfen

```bash
docker buildx imagetools inspect ghcr.io/<owner>/therapia:0.8.0
```

Die Ausgabe listet `linux/amd64` und `linux/arm64`. GHCR legt ein neues Paket als privat an; das Paket `therapia` muss öffentlich sein (Paket-Einstellungen → „Change visibility“), sonst scheitert `docker compose pull` bei Betreiber:innen ohne Anmeldung. Das einmal von einem Rechner ohne GHCR-Anmeldung prüfen: `docker pull ghcr.io/<owner>/therapia:0.8.0`.

### 6. Release-Notes veröffentlichen

```bash
gh release create v0.8.0 --title "v0.8.0 – kurze Zusammenfassung" --notes-file ~/release-notes.md
```

Für Vorabversionen zusätzlich `--prerelease`. Alternativ im Browser: „Releases“ → „Draft a new release“ → Tag wählen. Auf diese Seite verweist die Betreiber-Doku („Release-Hinweise“).

### 7. Nacharbeiten

- `ROADMAP.md` („Stand“) nachziehen, wenn ein Meilenstein abgeschlossen ist.
- Betreiber:innen erfahren von Releases über GitHub („Watch“ → „Custom“ → „Releases“); einen eigenen Benachrichtigungsweg gibt es nicht.
- Eigene Instanzen (Demo, Pilot) nach [installation.md, Abschnitt 5](docs/betrieb/installation.md#5-updates) aktualisieren.

## Wenn etwas schiefgeht

- **`ci` rot:** Es gibt kein Image. Fehler auf `master` beheben und die nächste Patch-Version taggen. Den Tag nur löschen (`git push --delete origin v0.8.0`, dann `git tag -d v0.8.0`), wenn noch niemand ihn verwendet hat.
- **Image fehlerhaft:** eine neue Patch-Version veröffentlichen; Image-Tags nicht von Hand überschreiben. Die Release-Notes des fehlerhaften Release um einen Hinweis ergänzen.
- **Migration scheitert bei Betreiber:innen:** Rückweg nach [installation.md, Abschnitt 5.3](docs/betrieb/installation.md#53-zurück-zur-vorigen-version-rollback); die Korrektur kommt als neue Migration in einer neuen Version.

## Vorlage für Release-Notes

```markdown
Image: `ghcr.io/<owner>/therapia:X.Y.Z` (auch `X.Y` und `latest`)

### Neu
- …

### Geändert und behoben
- …

### Für Betreiber:innen
- **Datenbank-Migrationen:** keine | `00N_name.sql`, additiv – Rückkehr zur vorigen Version ohne Backup möglich | `00N_name.sql`, nicht additiv – Rückkehr nur mit dem Backup von vor dem Update
- **Dateien in `deploy/`:** unverändert | geändert: … – neu herunterladen wie in installation.md, Abschnitt 5
- **Neue Variablen in `.env`:** keine | `NAME` – Bedeutung, Standardwert
- **Update:** nach docs/betrieb/installation.md, Abschnitt 5 – vorher Backup
```
