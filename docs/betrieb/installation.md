# theraPiA betreiben – Installation, Updates, Backups

Diese Anleitung richtet eine theraPiA-Instanz auf einem eigenen Linux-Server ein: die App als fertiges Container-Image, PostgreSQL als Datenbank, [Caddy](https://caddyserver.com/) als Reverse Proxy mit automatischem HTTPS-Zertifikat (Let's Encrypt) und tägliche Datenbank-Backups. Sie richtet sich an alle, die theraPiA für andere Personen betreiben – für den Freundeskreis, als IT eines Ausbildungsinstituts oder als Dienstleister. Linux-Grundkenntnisse (SSH, Dateien bearbeiten, Befehle ausführen) reichen.

Zum Datenschutz beim Betrieb siehe [datenschutz.md](datenschutz.md), zu Aufgaben, Verantwortlichkeiten und Support-Grenzen den [Leitfaden für Betreiber:innen](README.md). Das `docker-compose.yml` im Hauptverzeichnis des Repositorys ist nur für die Entwicklung gedacht – für den Betrieb gilt ausschließlich das Setup aus dem Ordner `deploy/`, das diese Anleitung beschreibt.

**So sieht das Setup aus:**

| Container | Aufgabe | Von außen erreichbar |
|-----------|---------|----------------------|
| `caddy` | HTTPS, Zertifikate, leitet Anfragen an die App weiter | ja, Ports 80 und 443 |
| `app` | theraPiA (wendet beim Start offene Datenbank-Migrationen an; Feedback aus dem Widget im Volume `feedback_data`) | nein, nur über Caddy |
| `db` | PostgreSQL 15, Daten im Docker-Volume `db_data` | nein |
| `backup` | tägliches Datenbank-Backup nach `./backups` | nein |

Alle Befehle unten laufen auf dem Server in einer SSH-Sitzung. Ersetze `therapia.example.org` überall durch deine eigene Domain. Befehle mit `sudo` brauchen Administratorrechte; wenn du als `root` angemeldet bist, lass `sudo` weg.

## 1. Voraussetzungen

- **Linux-Server** mit mindestens 2 GB RAM und 20 GB freiem Speicher, z. B. ein kleiner Cloud-Server bei einem Hoster in der EU, mit Ubuntu 24.04 oder Debian 12. Der Server braucht eine öffentliche IPv4-Adresse.
- **Docker Engine mit Compose-Plugin.** Installation nach der offiziellen Anleitung für deine Distribution: <https://docs.docker.com/engine/install/>. Prüfen:

  ```bash
  docker --version
  docker compose version
  ```

  Beide Befehle müssen eine Versionsnummer ausgeben. `docker compose` (mit Leerzeichen) ist das Compose-Plugin; das alte `docker-compose` wird hier nicht verwendet. Wenn `docker` ohne `sudo` die Meldung „permission denied“ bringt: entweder allen Docker-Befehlen `sudo` voranstellen oder den eigenen Benutzer mit `sudo usermod -aG docker $USER` in die Gruppe `docker` aufnehmen und sich neu anmelden.
- **Eine Domain oder Subdomain**, z. B. `therapia.example.org`. Beim DNS-Anbieter einen **A-Record** anlegen, der auf die IPv4-Adresse des Servers zeigt (hat der Server IPv6, zusätzlich einen AAAA-Record). Prüfen, bevor es weitergeht:

  ```bash
  getent hosts therapia.example.org
  ```

  Die Ausgabe muss die IP-Adresse des Servers zeigen. DNS-Änderungen brauchen manchmal einige Minuten bis Stunden.
- **Firewall:** Nur die Ports 22 (SSH), 80 (HTTP, für die Zertifikatsausstellung) und 443 (HTTPS) dürfen von außen offen sein. Am besten in der Firewall des Hosters (Cloud-Firewall im Kundenmenü) und zusätzlich auf dem Server mit `ufw`:

  ```bash
  sudo ufw allow OpenSSH
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw enable
  sudo ufw status
  ```

  `sudo ufw enable` fragt, ob bestehende SSH-Verbindungen unterbrochen werden dürfen (`Proceed with operation (y|n)?`). Mit `y` bestätigen – das ist sicher, weil SSH (`OpenSSH`) im ersten Befehl freigegeben wurde.

  Achtung: Ports, die Docker veröffentlicht (`ports:` in der Compose-Datei), umgehen `ufw`. Deshalb veröffentlicht dieses Setup nur 80 und 443 – füge keine weiteren `ports:` hinzu.
- **SSH nur mit Schlüssel:** Anmeldung per Passwort abschalten, sobald die Anmeldung mit SSH-Schlüssel funktioniert. In `/etc/ssh/sshd_config` (oder einer Datei in `/etc/ssh/sshd_config.d/`) `PasswordAuthentication no` setzen, dann `sudo systemctl restart ssh` (bei manchen Distributionen heißt der Dienst `sshd`). Vorher in einem zweiten Terminal prüfen, dass die Schlüssel-Anmeldung klappt, sonst sperrst du dich aus.

## 2. Installation

**Version wählen.** Die aktuelle Version steht unter <https://github.com/yannikmity/theraPiA/releases>. Solange dort noch kein Eintrag steht, gilt der neueste Tag (Reiter „Tags“ derselben Seite); wie Releases entstehen, beschreibt [RELEASING.md](../../RELEASING.md). Ein Release heißt z. B. `v0.2.0`; das zugehörige Image hat den Tag `0.2.0` (ohne `v`). Ersetze `0.2.0` unten durch die aktuelle Versionsnummer.

**Dateien holen:**

```bash
mkdir ~/therapia && cd ~/therapia

VERSION=0.2.0
curl -fsSLo docker-compose.yml "https://raw.githubusercontent.com/yannikmity/theraPiA/v${VERSION}/deploy/docker-compose.yml"
curl -fsSLo Caddyfile "https://raw.githubusercontent.com/yannikmity/theraPiA/v${VERSION}/deploy/Caddyfile"
curl -fsSLo .env "https://raw.githubusercontent.com/yannikmity/theraPiA/v${VERSION}/deploy/.env.example"
chmod 600 .env
ls -la
```

`ls -la` muss `docker-compose.yml`, `Caddyfile` und `.env` zeigen. Bricht `curl` mit „404“ ab, stimmt die Versionsnummer nicht.

**Zufallswerte erzeugen.** Du brauchst zwei Zufallswerte – einmal für die Anmelde-Sitzungen, einmal als Datenbankpasswort:

```bash
openssl rand -base64 32   # für NEXTAUTH_SECRET
openssl rand -hex 24      # für POSTGRES_PASSWORD
```

Für das Datenbankpasswort `-hex` verwenden: Es landet in einer Verbindungs-URL, und Zeichen wie `/` oder `+` aus `-base64` würden sie unbrauchbar machen.

**`.env` ausfüllen** (z. B. mit `nano .env`, speichern mit Strg+O, Enter, beenden mit Strg+X):

| Variable | Was eintragen |
|----------|---------------|
| `THERAPIA_DOMAIN` | die Domain ohne `https://`, z. B. `therapia.example.org` |
| `NEXTAUTH_URL` | dieselbe Domain mit `https://` davor, ohne `/` am Ende. Pflicht: Der Platzhalter `https://therapia.example.org` aus der Vorlage muss ersetzt werden – mit fehlendem Wert, `http://` (einzige Ausnahme: `http://localhost` bzw. `http://127.0.0.1` für lokale Tests) oder einer `example.org`-/`example.com`-Adresse startet die App nicht |
| `THERAPIA_VERSION` | die Versionsnummer von oben, z. B. `0.2.0`. `latest` nur zum Ausprobieren – sonst weißt du nie, welche Version läuft |
| `NEXTAUTH_SECRET` | der erste Zufallswert (mindestens 32 Zeichen – sonst beendet sich die App beim Start und der Container startet ständig neu, siehe [Fehlersuche](#7-fehlersuche)) |
| `REGISTRATION_MODE` | `invite` (empfohlen): Registrierung nur mit Einladungslink. Jeder abgeschlossene Versuch verbraucht den Link – auch wenn die Adresse schon einen Account hat (dann gilt das bisherige Passwort weiter; die Antwort sieht wie eine Registrierung aus, damit der Link keine vergebenen Adressen verrät). `open`: jede Person mit der Adresse kann sich registrieren – eine schon vergebene Adresse wird dabei nicht verraten, die Registrierung sieht dann wie erfolgreich aus und das bisherige Passwort gilt weiter. `closed`: niemand kann sich registrieren (außer dem allerersten Account) |
| `POSTGRES_DB`, `POSTGRES_USER` | so lassen (`therapia`) |
| `POSTGRES_PASSWORD` | der zweite Zufallswert |
| `UMAMI_SCRIPT_URL`, `UMAMI_WEBSITE_ID` | optional, nur gemeinsam: eigene Umami-Instanz für eine Nutzungsstatistik, siehe [analytics.md](analytics.md). Leer lassen = keine Statistik |
| `TZ` | optional. Zeitzone des App-Containers (IANA-Name), Standard `Europe/Berlin` (im Image gesetzt). Kalendertage in der App – Sitzungsdaten, Quartale, Dateinamen der Exporte – gelten unabhängig davon immer in Europe/Berlin; `TZ` bestimmt nur die Uhr des Containers (Log-Zeitstempel). Nur setzen, wenn die Instanz in einer anderen Zeitzone betrieben wird, und dann nie leer lassen: `TZ=` erzwingt UTC |

Regeln für die `.env`: Werte ohne Anführungszeichen und ohne Leerzeichen um das `=` eintragen. Eine leere Zeile wie `REGISTRATION_MODE=` gilt als nicht gesetzt, dann greift der Standardwert (`invite`). `TZ` hat einen Standard im Image (`Europe/Berlin`); eine leere Zeile `TZ=` setzt ihn außer Kraft. `NEXTAUTH_SECRET`, `NEXTAUTH_URL` und `POSTGRES_PASSWORD` haben keinen Standardwert und müssen ausgefüllt sein. `POSTGRES_PASSWORD` nach dem ersten Start nicht mehr ändern: Die Datenbank übernimmt das Passwort nur beim allerersten Start.

**Backup-Ordner anlegen:** Fehlt der Ordner `backups`, legt Docker ihn beim Start als `root` mit Leserechten für alle Benutzer:innen des Servers an – die Backups wären dann für jedes Konto auf dem Server lesbar. Deshalb vorher selbst anlegen, nur für dich lesbar:

```bash
mkdir -m 700 backups
```

**Prüfen und starten:**

```bash
docker compose config --quiet && echo "Konfiguration ok"
docker compose up -d
docker compose logs -f app
```

Beim ersten Start lädt Docker die Images herunter, das dauert ein paar Minuten. Im Log erscheinen zuerst `Migrationen angewendet: …`, dann `✓ Ready in …`. Dann mit Strg+C das Log verlassen (die Container laufen weiter). Anschließend:

```bash
docker compose ps
curl https://therapia.example.org/api/health
```

`docker compose ps` zeigt vier Container mit Status `Up`; bei `app`, `db` und `backup` steht nach spätestens einer Minute `(healthy)` dahinter. Der Health-Check antwortet mit `{"status":"ok"}`. Caddy holt das HTTPS-Zertifikat beim ersten Aufruf der Domain; klappt das nicht, siehe [Fehlersuche](#7-fehlersuche).

**Sicherheitsregeln für dieses Setup – nicht ändern:**

- Der Port der App (3000) wird **nie** veröffentlicht, auch nicht „nur kurz zum Testen“. Caddy ist der einzige Eingang. Die App begrenzt Anmeldeversuche pro IP-Adresse und Konto (10 in 15 Minuten) sowie pro Konto über alle IP-Adressen (20 in 15 Minuten) und liest die Adresse aus dem Header `X-Forwarded-For`. Caddy überschreibt diesen Header mit der echten Adresse der Besucher:in; wer die App direkt erreicht, könnte ihn fälschen und die Begrenzung umgehen.
- Keinen weiteren Proxy, Load Balancer oder CDN (z. B. Cloudflare) vor Caddy schalten, ohne Caddy so zu konfigurieren, dass es diesem vertraut (`trusted_proxies`). Sonst sehen alle Anfragen für die App aus, als kämen sie von derselben Adresse.
- Die App setzt ihre Content-Security-Policy selbst, auf jeder Antwort und mit einer **neuen Nonce pro Anfrage**: Skripte laufen nur, wenn sie diese Nonce tragen oder aus der eigenen Origin (bzw. der eingestellten Umami-Instanz) stammen. Deshalb im Caddyfile (oder einem anderen Proxy davor) **keine eigene `Content-Security-Policy`** setzen oder überschreiben – zwei Policies gelten gleichzeitig, und eine ohne die Nonce blockiert die Inline-Skripte von Next – die App ist dann funktionslos. HTML-Antworten **nicht zwischenspeichern** (kein Seiten-Cache, CDN-Cache nur für `/_next/static/`): Jede Seite wird pro Anfrage gerendert, eine gecachte Seite trüge eine für alle gleiche und damit vorhersagbare Nonce (der Schutz wäre wirkungslos) oder passte nicht mehr zur Nonce im Header (die Seite funktionierte nicht). Keine HTML-Umschreiber (z. B. automatisches Nachladen von Skripten, E-Mail-Verschleierung eines CDN) – die eingefügten Skripte haben keine Nonce und werden blockiert. Das mitgelieferte Caddyfile erfüllt das (`encode gzip`, `reverse_proxy`, sonst nichts).
- Die Datenbank bekommt ebenfalls keinen veröffentlichten Port. Für Abfragen: `docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`.

## 3. Ersten Account anlegen

Direkt nach dem Start im Browser `https://therapia.example.org/auth/register` öffnen und einen Account anlegen (Passwort mindestens 10 Zeichen). **Der erste Account einer Instanz wird Admin** – unabhängig von `REGISTRATION_MODE`.

> **Warnung:** Bis der erste Account existiert, kann sich jede Person, die die Adresse kennt, als Admin registrieren. Lege ihn deshalb sofort nach dem ersten Start an.

Danach sind weitere Registrierungen je nach `REGISTRATION_MODE` nur mit Einladungslink (`invite`), frei (`open`) oder gar nicht (`closed`) möglich.

## 4. Personen einladen

Alles Folgende steht Admins unter **Profil → Administration** zur Verfügung:

- **Einladen:** Einladungslink erzeugen und der Person vertraulich schicken (z. B. per E-Mail oder Messenger). Der Link gilt 14 Tage und nur einmal. Auch ein Versuch mit einer schon registrierten Adresse verbraucht ihn – dann meldet sich die Person mit dem bisherigen Passwort an; für einen neuen Versuch einen neuen Link erzeugen. Wer ihn hat, kann damit einen Account anlegen – deshalb nicht öffentlich teilen. Weise in der Einladung darauf hin, dass in Notizfeldern keine Klarnamen oder Diagnosen stehen dürfen (siehe [datenschutz.md](datenschutz.md)). Läuft ein Link ab, ohne eingelöst zu werden, entfernt die App die eingetragene E-Mail-Adresse 30 Tage später aus der Einladung.
- **Demo-Zugang:** Mit dem Häkchen „Mit Beispieldaten starten (Demo-Zugang)“ startet der neue PiA-Account mit fiktiven Beispieldaten und bleibt als Demo-Account gekennzeichnet – siehe [demo-accounts.md](demo-accounts.md).
- **Passwort vergessen:** Die App verschickt keine E-Mails. Stattdessen erzeugt ein Admin für den Account einen Reset-Link (gilt 24 Stunden) und schickt ihn der Person vertraulich. Über den Link legt sie ein neues Passwort fest.
- **Account sperren:** Ein gesperrter Account kann sich nicht mehr anmelden, laufende Anmeldungen enden. Die Daten bleiben erhalten; die Sperre lässt sich wieder aufheben. Der letzte aktive Admin lässt sich nicht sperren – vorher eine zweite Person als Admin einladen. Zum endgültigen Löschen siehe [datenschutz.md](datenschutz.md).
- **Sitzungsdauer:** Eine Anmeldung gilt 7 Tage ohne Nutzung; wer die App nutzt, bleibt angemeldet (die Frist verlängert sich bei jeder Nutzung). Sperre und Passwortwechsel beenden laufende Sitzungen sofort. Ist die Datenbank kurz nicht erreichbar, landen angemeldete Personen auf der Login-Seite und müssen sich danach neu anmelden – der Browser verwirft die Sitzung, sobald er sie während des Ausfalls prüft; im App-Log steht dann „Sitzungsprüfung fehlgeschlagen“.
- **Ausbildungsregeln:** Stundenziele, Verhältnis, Gruppenziele und EBM-Staffel der Instanz pflegen – siehe [Abschnitt 9](#9-ausbildungsregeln).

## 5. Updates

Updates erscheinen als neue Releases unter <https://github.com/yannikmity/theraPiA/releases>. Lies vor jedem Update die Release-Hinweise.

Die Release-Hinweise nennen Datenbank-Migrationen (und ob sie additiv sind), geänderte Dateien in `deploy/` und neue Variablen für die `.env` – Aufbau siehe [RELEASING.md](../../RELEASING.md#vorlage-für-release-notes). Welche Version gerade läuft: `grep THERAPIA_VERSION .env` im Ordner der Installation. Wer mehrere Instanzen betreibt, aktualisiert sie nacheinander, jede mit eigenem Backup (siehe [mehrere-instanzen.md](mehrere-instanzen.md#updates-über-mehrere-instanzen)).

### 5.1 Vorher: Backup

**Vor jedem Update ein frisches Backup erstellen und prüfen.** Ein Update kann Datenbank-Migrationen enthalten, die sich nicht rückgängig machen lassen; ohne Backup gibt es dann keinen Weg zurück.

```bash
cd ~/therapia   # der Ordner aus Abschnitt 2
docker compose exec backup /backup.sh
ls -lh backups/last/
```

Die Ausgabe endet mit `SQL backup created successfully`, und in `backups/last/` liegt eine Datei `therapia-<Datum>-<Uhrzeit>.sql.gz` mit aktuellem Zeitstempel (Uhrzeit in UTC). Sie darf nicht 0 Byte groß sein; schon eine frische Instanz ergibt einige Kilobyte.

### 5.2 Update durchführen

1. In `.env` `THERAPIA_VERSION` auf die neue Versionsnummer setzen (ohne `v`).
2. Falls das Release geänderte Dateien in `deploy/` erwähnt, `docker-compose.yml` und `Caddyfile` mit den `curl`-Befehlen aus [Abschnitt 2](#2-installation) und der neuen Version neu herunterladen (diese Version ergänzt das Volume `feedback_data`; die `.env` dabei **nicht** überschreiben, sondern neue Variablen aus `deploy/.env.example` von Hand ergänzen).
3. Neue Images holen und die Container neu starten:

   ```bash
   docker compose pull
   docker compose up -d
   docker compose logs -f app
   ```

   Die App wendet neue Migrationen beim Start automatisch an (`Migrationen angewendet: …`) und meldet dann `✓ Ready in …`. Zum Schluss den Health-Check aus Abschnitt 2 aufrufen.

### 5.3 Zurück zur vorigen Version (Rollback)

**Fall 1 – eine Migration ist abgebrochen.** Die App startet nicht, das Log zeigt `Migration … fehlgeschlagen: …`. Die fehlgeschlagene Migration wurde vollständig zurückgerollt, die Daten sind im Zustand vor dem Update. Dann entweder die Ursache beheben und `docker compose up -d` wiederholen oder zur alten Version zurückkehren: `THERAPIA_VERSION` zurücksetzen, `docker compose up -d`. Waren vorher schon andere Migrationen des Updates durchgelaufen, reicht das nicht: dann wie in Fall 2 unter „Nicht additive Migrationen“ zurückkehren (erst die Version zurücksetzen, dann das Backup von vor dem Update einspielen, zum Schluss `docker compose up -d`).

**Fall 2 – das Update lief durch, die neue Version macht Probleme.** Was zu tun ist, hängt von den Migrationen des Updates ab (sie stehen in den Release-Hinweisen). Hat das Update `docker-compose.yml` und `Caddyfile` neu heruntergeladen ([Abschnitt 5.2](#52-update-durchführen), Schritt 2), können sie meist bleiben; sagen die Release-Hinweise etwas anderes, die der vorigen Version mit den `curl`-Befehlen aus [Abschnitt 2](#2-installation) laden – und zwar bevor auf dem Rückweg zum ersten Mal `docker compose up -d` läuft (beim Rückweg mit Backup also vor Schritt 2).

- **Keine oder nur additive Migrationen** (neue Tabellen, neue Spalten mit Standardwert oder ohne Pflichtwert – so sind 004 bis 007): In `.env` `THERAPIA_VERSION` auf die vorige Version setzen, dann

  ```bash
  docker compose up -d
  docker compose logs --tail 50 app
  ```

  Das Log zeigt `Datenbank ist aktuell.` und `✓ Ready in …`. Die ältere Version übergeht neue Tabellen und Spalten sowie Einträge in `schema_migrations`, zu denen sie keine Datei hat; alles seit dem Update Erfasste bleibt erhalten. Beim späteren erneuten Update laufen diese Migrationen nicht noch einmal.
- **Nicht additive Migrationen oder im Zweifel:** zurück mit dem Backup von vor dem Update. Alles, was seit dem Backup erfasst wurde, geht dabei verloren – deshalb den Rückweg zügig entscheiden. Die Reihenfolge ist wichtig: Startet nach dem Einspielen noch das neue Image, wendet es seine Migrationen erneut an.

  1. In `.env` `THERAPIA_VERSION` auf die vorige Version setzen.
  2. Das Backup wie in [Abschnitt 6](#6-backups) unter „Wiederherstellen“ einspielen; das dortige `docker compose pull` und `docker compose up -d` holen dabei schon das alte Image.
  3. Statt mit `docker compose start app` mit `docker compose up -d` abschließen, damit der Container `app` sicher mit dem alten Image läuft, dann `docker compose logs --tail 50 app` prüfen: `Datenbank ist aktuell.` und `✓ Ready in …`.

  Meldet das Einspielen in Schritt 2 einen Fehler (`ERROR:`), ist die Datenbank noch im Zustand der neuen Version: dann nicht mit Schritt 3 weitermachen, sondern ein anderes Backup einspielen oder in `.env` wieder die neue Version setzen und mit `docker compose up -d` starten.

Danach den Health-Check aus [Abschnitt 2](#2-installation) aufrufen und den Fehler als Issue melden (siehe [Support-Grenzen](README.md#support-grenzen)).

### 5.4 Hinweise zu einzelnen Versionen

**Update mit Ausbildungsregeln (Migration 005):** Die Migration legt nur neue Tabellen an und trägt die bisherigen festen Werte als Ausbildungsprofil und EBM-Staffel (gültig ab 01.01.2000) ein – nach dem Update zeigt die App dieselben Zahlen wie vorher. Wer andere Vorgaben hat, passt sie danach unter Profil → Administration an (siehe [Abschnitt 9](#9-ausbildungsregeln)).

**Update mit Demo-Zugängen (Migration 006):** Die Migration ergänzt nur zwei Spalten mit Standardwert `false` (`invitations.with_demo_data`, `users.is_demo`); bestehende Accounts und Einladungen bleiben unverändert, zu tun ist nichts. Additiv im Sinne von [Abschnitt 5.3](#53-zurück-zur-vorigen-version-rollback) – eine ältere Version läuft weiter, Demo-Accounts verlieren dort nur ihre Kennzeichnung. Funktion: [demo-accounts.md](demo-accounts.md).

**Update mit Sprechstunde, Gesprächsziffern und Kontingenten (Migration 007):** erweitert die Kategorie-Prüfung von `therapy_sessions` und ergänzt `patients.genehmigungsdatum` (NULL) und `patients.sprechstunden_ambulanz` (0); bestehende Daten unverändert. Additiv im Sinne von [Abschnitt 5.3](#53-zurück-zur-vorigen-version-rollback) – eine ältere Version läuft weiter, zeigt Sitzungen der neuen Kategorien dort aber ohne Bezeichnung und kann sie nicht bearbeiten; in den Behandlungsstunden zählen sie weiterhin.

**Bestehende Datenbank aus dem Entwicklungs-Setup übernehmen.** Wer theraPiA bisher lokal mit dem `docker-compose.yml` aus dem Hauptverzeichnis des Repositorys genutzt hat (vor Admin-Bereich und Einladungslinks), kann diese Datenbank in die neue Instanz umziehen: Auf dem alten Rechner die Datenbank sichern mit `docker exec therapia_postgres pg_dump --no-owner --no-privileges -U therapia_user therapia | gzip > umzug.sql.gz`, die Datei in den Ordner `~/therapia` auf dem Server kopieren (z. B. mit `scp`) und wie in Abschnitt 6 unter „Wiederherstellen“ mit `BACKUP=umzug.sql.gz` einspielen. Danach `umzug.sql.gz` löschen. Beim Start wendet die App die fehlenden Migrationen an; dabei gilt:

- Alle Nutzer:innen müssen sich einmal neu anmelden. Das ist beabsichtigt.
- E-Mail-Adressen werden ab dieser Version in Kleinbuchstaben gespeichert. Gibt es zwei Accounts, deren Adressen sich nur in Groß-/Kleinschreibung unterscheiden, bricht die Migration ab. Dann einen der beiden Accounts per SQL auf eine andere Adresse ändern oder löschen und neu starten.
- Die Migration löscht verwaiste Datensätze, die zu keinem Account mehr gehören. Die Sicherung `umzug.sql.gz` erst löschen, wenn alles geprüft ist.
- Der älteste Account wird automatisch Admin.

## 6. Backups

Der Container `backup` sichert die Datenbank jede Nacht um 0 Uhr (UTC) als komprimierten SQL-Dump in den Ordner `backups/` neben der `docker-compose.yml`. Der Ordner muss mit `mkdir -m 700 backups` angelegt sein (Abschnitt 2), sonst sind die Dumps für alle Konten auf dem Server lesbar. Bei einer bestehenden Installation nachträglich: `sudo chmod 700 backups`.

| Ordner | Inhalt | Aufbewahrung |
|--------|--------|--------------|
| `backups/last/` | jedes einzelne Backup, auch manuell ausgelöste | 24 Stunden |
| `backups/daily/` | ein Backup pro Tag | 7 Tage |
| `backups/weekly/` | ein Backup pro Woche | 4 Wochen |
| `backups/monthly/` | ein Backup pro Monat | 6 Monate |

In jedem Ordner zeigt `therapia-latest.sql.gz` auf das neueste Backup. Ein zusätzliches Backup außer der Reihe: `docker compose exec backup /backup.sh`.

**Backups zusätzlich außer Haus kopieren.** Die Backups liegen auf demselben Server wie die Datenbank – fällt der Server aus oder wird er kompromittiert, sind sie mit weg. Kopiere den Ordner `backups/` regelmäßig verschlüsselt auf einen anderen Speicher, z. B. mit [restic](https://restic.net/) auf einen Storage-Dienst in der EU (per `cron` täglich nach 0 Uhr). Die Backups enthalten alle Daten der Instanz im Klartext; unverschlüsselt dürfen sie den Server nicht verlassen.

**Wiederherstellen.** Das Einspielen ersetzt den kompletten Datenbankinhalt durch den Stand des Backups – alles, was nach dem Backup erfasst wurde, geht verloren. Vor einer Wiederherstellung `docker compose pull` ausführen und mit `docker compose up -d` übernehmen: Backup- und Datenbank-Image bringen jeweils eigene PostgreSQL-Werkzeuge mit (`pg_dump` bzw. `psql`); sind sie unterschiedlich alt, kann das Einspielen fehlschlagen.

1. Backup auswählen: `ls -l backups/daily/ backups/last/`. Den Dateipfad merken, z. B. `backups/daily/therapia-20260925.sql.gz`. Achtung: `therapia-latest.sql.gz` zeigt auf das zuletzt erstellte Backup – hast du gerade eben eins ausgelöst, ist das der aktuelle Stand und nicht der gewünschte ältere.
2. App anhalten, Datenbank leeren und Backup einspielen, App wieder starten:

   ```bash
   BACKUP=backups/daily/therapia-20260925.sql.gz

   docker compose stop app
   { echo 'SET client_min_messages = warning; DROP SCHEMA public CASCADE; CREATE SCHEMA public;'; gunzip -c "$BACKUP"; } \
     | docker compose exec -T db sh -c 'psql -q -1 -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > /dev/null
   docker compose start app
   ```

   Der mittlere Befehl leert die Datenbank und spielt das Backup in einer einzigen Transaktion ein (`-1`). Gibt er nichts aus, hat es geklappt. Schlägt etwas fehl (z. B. beschädigte Datei), zeigt er eine Meldung mit `ERROR:` und die Datenbank bleibt unverändert im alten Zustand; die App dann trotzdem mit `docker compose start app` wieder starten.
3. Prüfen: Health-Check aus Abschnitt 2 aufrufen und in der App anmelden – die Daten entsprechen dem Stand des Backups.

**Wiederherstellung einmal direkt nach der Installation testen:** ersten Account anlegen, ein Backup auslösen (`docker compose exec backup /backup.sh`), dann die Schritte oben mit der Datei aus `backups/last/` durchgehen und prüfen, dass die Anmeldung danach noch funktioniert. Ein Backup, dessen Wiederherstellung nie geprüft wurde, ist keins.

## 7. Fehlersuche

Alle Befehle im Ordner der Installation ausführen (`cd ~/therapia`).

- **Läuft alles?** `docker compose ps` – alle vier Container müssen `Up` sein. Steht bei einem `Restarting` oder `Exited`, dessen Log ansehen.
- **Logs:** `docker compose logs app` (bzw. `db`, `caddy`, `backup`); mit `--tail 100` nur die letzten Zeilen, mit `-f` fortlaufend.
- **Health-Check:** `curl https://therapia.example.org/api/health` antwortet mit `{"status":"ok"}`. `{"status":"error"}` heißt: Die App läuft, erreicht aber die Datenbank nicht → `docker compose logs db`.
- **Container `app` startet ständig neu (`Restarting`), `docker compose logs app` zeigt `Ungültige Konfiguration – …`:** Die App prüft ihre Konfiguration beim Start und beendet sich, wenn etwas nicht stimmt. Die Meldung nennt die Ursache, z. B. `NEXTAUTH_SECRET: muss mindestens 32 Zeichen haben`, `NEXTAUTH_URL: muss mit https:// beginnen (Ausnahme: localhost)` oder einen ungültigen `REGISTRATION_MODE`. Wert in `.env` korrigieren (siehe Abschnitt 2), dann `docker compose up -d`.
- **App startet nicht oder startet ständig neu, Log zeigt `password authentication failed`:** `POSTGRES_PASSWORD` in `.env` wurde nach dem ersten Start geändert. Den alten Wert wieder eintragen.
- **Zertifikatsprobleme** (Browser meldet unsicheres Zertifikat, `curl` meldet einen SSL-Fehler, oder `docker compose logs caddy` zeigt Fehler zu `acme` oder `challenge`): Meist stimmt der DNS-Eintrag nicht oder Port 80/443 ist gesperrt. Prüfen, dass `getent hosts therapia.example.org` die Server-IP liefert, dass `THERAPIA_DOMAIN` in `.env` genau diese Domain enthält und dass die Ports 80 und 443 in der Hoster-Firewall und in `ufw` offen sind. Danach `docker compose restart caddy`. Let's Encrypt begrenzt fehlgeschlagene Versuche; nach vielen Fehlversuchen eine Stunde warten.
- **Anmeldung klappt nicht oder Links in der App zeigen auf eine falsche Adresse:** `NEXTAUTH_URL` muss genau die Adresse sein, unter der die App im Browser aufgerufen wird (mit `https://`, ohne `/` am Ende). Nach einer Änderung `docker compose up -d`.
- **Anmeldung meldet „Zu viele Anmeldeversuche“:** Für dieses Konto gab es zu viele Versuche in 15 Minuten (10 von derselben IP-Adresse oder 20 insgesamt) – auch dann, wenn jemand anderes ein fremdes Konto durchprobiert hat. Solange die Sperre gilt, hilft auch das richtige Passwort nicht; nach 15 Minuten geht es weiter. Die Zähler liegen im Arbeitsspeicher des App-Containers; `docker compose restart app` setzt sie sofort zurück.
- **Passwort ändern oder Account löschen meldet „Zu viele Versuche“:** Für diesen Account wurde das aktuelle Passwort in 15 Minuten fünfmal falsch eingegeben. Nach 15 Minuten geht es weiter; `docker compose restart app` setzt den Zähler sofort zurück. Der Zähler schützt davor, dass jemand mit einer offenen Sitzung das Passwort durchprobiert.
- **Registrierungsseite meldet „Registrierung nur mit Einladung“:** Es gibt schon einen Account und `REGISTRATION_MODE` ist `invite` oder `closed`. Ein Admin erzeugt einen Einladungslink (Abschnitt 4).
- **Einziger Admin hat das Passwort vergessen:** Einen anderen, bestehenden Account per SQL zum Admin machen und mit ihm einen Reset-Link für den alten Admin erzeugen. Datenbank-Konsole öffnen:

  ```bash
  docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
  ```

  Dort eingeben (Adresse des anderen Accounts statt `pia@example.com`), die Antwort muss `UPDATE 1` lauten; mit `\q` die Konsole verlassen:

  ```sql
  UPDATE users SET role = 'admin' WHERE email = 'pia@example.com';
  ```
- **Feedback-Widget meldet „Ein Fehler ist aufgetreten“ beim Speichern:** `docker compose logs app` zeigt `Feedback speichern fehlgeschlagen: … EACCES` → der Ordner `/data/feedback` gehört nicht dem App-User (nur bei Host-Ordnern statt Volume, siehe Abschnitt 8). Meldet das Widget „Anfrage zu groß“, war die Anfrage über 12 MB – das kommt nur bei manipulierten Anfragen vor: Screenshots über 8 MB hängt das Widget gar nicht erst an, und ein ungültiges Bild verwirft die App, der Text wird trotzdem gespeichert.
- **Statistik kommt nicht an:** Seitenquelltext auf `script.js` prüfen (fehlt → Variablen nicht gesetzt oder Container nicht neu gestartet); Browser-Konsole auf CSP-Meldungen prüfen (Origin der Script-URL muss der Instanz entsprechen); Ad-Blocker und „Do Not Track“ ausschließen – mit „Do Not Track“ sendet die App bewusst nichts. Details: [analytics.md](analytics.md).
- **Seite lädt, aber Knöpfe und Formulare reagieren nicht; die Browser-Konsole meldet „Refused to execute … because it violates the following Content Security Policy directive“:** Ein Proxy, CDN oder Browser-Add-on verändert die Antworten – meist eine zweite `Content-Security-Policy`, ein Seiten-Cache oder eingefügte Skripte (siehe Sicherheitsregeln in Abschnitt 2). Prüfen mit `curl -sI https://therapia.example.org/auth/login | grep -i content-security-policy`: Es muss **genau eine** Zeile erscheinen, und bei zwei Aufrufen muss der Wert hinter `'nonce-` jedes Mal anders sein. Die erwartete Form (ohne Umami): `default-src 'self'; script-src 'self' 'nonce-…'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`.

## 8. Feedback aus dem Widget

Angemeldete Personen können in der App über den Knopf „Feedback“ Rückmeldungen zu einzelnen Elementen geben – mit Text, Bewertung und (abwählbar) einem Screenshot des sichtbaren Bildschirms. Admins lesen sie unter Profil → Administration → Feedback. Technisch liegt jedes Feedback als Markdown-Datei (`<id>.md`, Metadaten im Kopf) und ggf. `<id>.png` im Docker-Volume `feedback_data` (im Container `/data/feedback`). Das Volume ist **nicht** Teil des Datenbank-Backups.

- **Ansehen auf dem Server:** `docker compose exec app ls -l /data/feedback` und `docker compose exec app cat /data/feedback/<id>.md`.
- **Herunterladen:** `docker compose cp app:/data/feedback ./feedback-export` (Ordner danach wie Backups behandeln: vertraulich, Screenshots können Chiffren zeigen).
- **Löschen nach Auswertung:** `docker compose exec app sh -c 'rm -f /data/feedback/<id>.md /data/feedback/<id>.png'` (die PNG gibt es nur, wenn ein Screenshot mitgeschickt wurde); alles auf einmal: `docker compose exec app sh -c 'rm -f /data/feedback/*'`. Lege eine Frist fest (z. B. nach Abschluss der Pilotphase) und nimm sie in die Datenschutzhinweise auf (siehe [datenschutz.md](datenschutz.md)).
- **Eigener Ordner statt Volume:** Wer `feedback_data:/data/feedback` in der `docker-compose.yml` durch einen Host-Ordner ersetzt (`./feedback:/data/feedback`), muss ihn dem App-User geben: `mkdir -m 700 feedback && sudo chown $(docker compose exec -T app id -u):$(docker compose exec -T app id -g) feedback` – sonst kann die App nicht schreiben und das Widget meldet beim Speichern „Ein Fehler ist aufgetreten“ (siehe Abschnitt 7).

## 9. Ausbildungsregeln

Stundenziele, Verhältnis und Gruppenziele sind pro Instanz einstellbar. Admins pflegen sie unter **Profil → Administration → Ausbildungsprofil**, die Honorar-Staffel der Gruppe unter **Profil → Administration → EBM-Staffel**. Jede Person kann unter **Profil → Meine Ausbildungsregeln** davon abweichen (etwa bei einem anderen Institut oder Ausbildungsstand); Admins sehen diese persönlichen Werte nicht.

| Regel | Standard | Wirkt auf |
|---|---|---|
| Ziel Behandlungsstunden (à 50 Min) | 600 | Dashboard, Nachweis-Hinweis |
| Ziel SV-Einheiten (à 50 Min) | 150 | Dashboard |
| Soll-Verhältnis 1 : x | 4 | Verhältnis-Anzeige („Passt“/„Knapp“), fehlende Supervision, Nachweis „Soll“ |
| Kritisch ab 1 : x | 5 | „Supervision fehlt“ |
| Ziel Doppelstunden Gruppe / davon Ambulanzzeit | 60 / 40 | Dashboard, Gruppen |

- **Reihenfolge:** Standardwert → Ausbildungsprofil → persönliche Abweichung. Soll und kritische Schwelle sowie die beiden Gruppenziele werden nur gemeinsam persönlich überschrieben. Änderungen am Profil gelten sofort für alle Accounts ohne eigene Abweichung – auch rückwirkend in Dashboard und Nachweis.
- **Zurücksetzen:** „Auf Standardwerte zurücksetzen“ löscht das Profil; die App rechnet dann mit den Standardwerten der Tabelle oben.
- **Nachweis:** Gelten für eine Person eigene Regeln, nennt der Nachweis sie im Summenblock („Es gelten persönlich festgelegte Ausbildungsregeln: …“).

**EBM-Staffel pflegen.** Die Staffel legt je Kinderzahl Gesamthonorar und eigenen Anteil einer Doppelstunde fest. Maßgeblich ist das Datum der Doppelstunde: Es gilt die Staffel mit dem spätesten Gültigkeitsbeginn bis zu diesem Tag; Doppelstunden vor der ältesten Staffel rechnet die App mit der ältesten. Unter der kleinsten Kinderzahl gibt es kein Honorar, darüber gilt die größte Stufe. Ändert sich der EBM (meist zum Jahres- oder Quartalsbeginn), unter **Neue Staffel** eine Kopie der neuesten anlegen, als „Gültig ab“ den ersten Tag des Quartals eintragen und die Beträge anpassen – alte Quartale behalten so ihre alten Beträge. Eine bestehende Staffel zu bearbeiten ändert dagegen auch zurückliegende Finanzen und Prognosen. Die letzte Staffel lässt sich nicht löschen.

**Prüfen per SQL** (Konsole wie in Abschnitt 7):

```sql
SELECT * FROM ausbildungsprofil;
SELECT s.gueltig_ab, st.kinderzahl, st.honorar_gesamt, st.honorar_anteil
  FROM ebm_staffeln s JOIN ebm_staffel_stufen st ON st.staffel_id = s.id ORDER BY 1, 2;
SELECT count(*) FROM ausbildungsregeln_abweichungen;  -- nur die Anzahl, die Werte gehören den Personen
```
