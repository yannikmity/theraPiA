# Sicherheit

## Sicherheitslücken melden

Bitte melde Sicherheitslücken **nicht** als öffentliches Issue, sondern vertraulich über GitHub: Tab „Security“ → „Report a vulnerability“.

Beschreib kurz, wie sich die Lücke reproduzieren lässt und welche Daten betroffen sein könnten. Du bekommst in der Regel innerhalb einer Woche eine Rückmeldung.

## Unterstützte Versionen

Korrekturen, auch Sicherheitskorrekturen, erscheinen als neues Release auf Basis des aktuellen Stands (siehe [RELEASING.md](RELEASING.md)). Ältere Versionen werden nicht nachgepflegt – Betreiber:innen aktualisieren auf das neueste Release ([docs/betrieb/installation.md, Abschnitt 5](docs/betrieb/installation.md#5-updates)). Vorabversionen (`-rc`) sind nicht für den Betrieb mit echten Daten gedacht.

## Betriebshinweise

Wie eine Instanz sicher betrieben wird (HTTPS, Firewall, Backups, Updates), steht in [docs/betrieb/installation.md](docs/betrieb/installation.md), Hinweise zum Datenschutz in [docs/betrieb/datenschutz.md](docs/betrieb/datenschutz.md). Das Setup in `docker-compose.yml` im Hauptverzeichnis ist nur für die Entwicklung.
