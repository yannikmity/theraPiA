# PostgreSQL mit Docker – Lokales Setup

Diese Anleitung zeigt dir, wie du PostgreSQL lokal in Docker startest und mit deiner theraPiA-App verbindest.

---

## Voraussetzungen

- **Docker Desktop** installiert
  - [Windows](https://docs.docker.com/desktop/install/windows-install/)
  - [Mac](https://docs.docker.com/desktop/install/mac-install/)
  - [Linux](https://docs.docker.com/engine/install/)

Überprüf es:
```bash
docker --version
docker-compose --version
```

---

## 1️⃣ PostgreSQL + pgAdmin starten

```bash
# Im Projekt-Ordner
cd theraPiA

# .env anlegen und NEXTAUTH_SECRET setzen
cp .env.example .env

# Container hochfahren (inkl. pgAdmin)
docker compose --profile tools up -d
```

Das startet:
- **PostgreSQL** auf `localhost:5432`
- **pgAdmin** (GUI) auf `http://localhost:5050`

Check ob's läuft:
```bash
docker-compose ps
```

Output sollte so aussehen:
```
NAME                 STATUS
therapia_postgres    Up (healthy)
therapia_pgadmin     Up
```

---

## 2️⃣ pgAdmin öffnen & Connection testen

Gehe zu: **http://localhost:5050**

Login:
```
Email: admin@therapia.dev
Passwort: admin
```

Dann:
1. Rechtsklick auf **Servers** → **Register** → **Server**
2. Tab **General**:
   - Name: `therapia_local`
3. Tab **Connection**:
   - Host name/address: `postgres` (oder `localhost`)
   - Port: `5432`
   - Username: `therapia_user`
   - Password: `therapia_dev_password`
   - Database: `therapia`
4. **Save**

✅ Wenn die Verbindung klappt, sieht du die Datenbank `therapia` im Browser.

---

## 3️⃣ Migrationen

Die Tabellen legst du nicht von Hand an. Die SQL-Dateien in `migrations/` werden in Dateinamen-Reihenfolge angewendet, jede genau einmal; welche schon gelaufen sind, merkt sich die Datenbank.

- **Mit Docker-Frontend** (`docker compose up -d`): Der Frontend-Container wendet offene Migrationen bei jedem Start an, bevor der Dev-Server startet. Das Produktions-Image macht es genauso.
- **Ohne Docker-Frontend** (App läuft per `npm run dev` direkt auf dem Rechner):

```bash
npm run migrate
```

Ausgabe: `Migrationen angewendet: …` oder `Datenbank ist aktuell.`

---

## 4️⃣ SQL direkt ausführen

Für Abfragen zwischendurch, etwa um Daten zu prüfen. Das Schema legst du nicht von Hand an – dafür sind die Migrationen da (siehe oben). Änderungen am Schema immer als neue Datei in `migrations/`.

**Option A: Via pgAdmin**

1. pgAdmin öffnen
2. Links: `therapia_local` → `Databases` → `therapia` → Rechtsklick → `Query Tool`
3. SQL eingeben, z. B. `SELECT email, role FROM users;`
4. Play-Button drücken

**Option B: Via Command Line**

```bash
# psql im Datenbank-Container öffnen
docker exec -it therapia_postgres psql -U therapia_user -d therapia

# Dann Befehle eingeben, z. B.:
SELECT name, applied_at FROM schema_migrations;

# Zum Beenden: \q
```

---

## 5️⃣ Verbindung für `npm run dev`

Läuft die App direkt auf dem Rechner (`npm run dev`), liest sie die Verbindung aus `.env` (Vorlage: `.env.example`):

```env
DATABASE_URL=postgresql://therapia_user:therapia_dev_password@localhost:5432/therapia
```

Dann:
```bash
npm run migrate
npm run dev
```

---

## 6️⃣ Hilfsbefehle

```bash
# Status anschauen
docker-compose ps

# Logs anschauen (PostgreSQL)
docker-compose logs postgres

# Container stoppen
docker-compose stop

# Container wieder starten
docker-compose start

# Alles löschen (vorsicht! Daten weg)
docker-compose down -v

# In PostgreSQL Shell gehen
docker exec -it therapia_postgres psql -U therapia_user -d therapia

# Offene Migrationen anwenden (ohne Docker-Frontend)
npm run migrate
```

---

## 🔍 Troubleshooting

### "Port 5432 already in use"
```bash
# Anderen Container stoppen
docker stop <container_name>

# Oder anderen Port nutzen in docker-compose.yml:
ports:
  - "5433:5432"  # Host:Container
```

### "Connection refused"
- Warte 10s nach `docker-compose up -d` (Container braucht Zeit)
- Check: `docker-compose ps` → Status muss `Up (healthy)` sein

### pgAdmin kann nicht connecten
- Hostname ist `postgres` (nicht localhost)
- Port: `5432`
- User: `therapia_user`
- Password: `therapia_dev_password`

### Datenbank löschen & neu anfangen
```bash
docker-compose down -v
docker-compose up -d
# Migrationen laufen beim Start des Frontend-Containers (sonst: npm run migrate)
```

---

## ✅ Fertig!

Jetzt hast du:
- ✅ PostgreSQL läuft lokal in Docker
- ✅ pgAdmin für DB-Verwaltung
- ✅ Datenbank-Schema über die Migrationen
- ✅ `.env` vorbereitet

Fragen? 🚀
