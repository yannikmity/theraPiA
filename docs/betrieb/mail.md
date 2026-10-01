# Mailversand für „Passwort vergessen“

Standard ist **aus**: Ohne Konfiguration verschickt theraPiA keine Mails. Wer das Passwort vergessen hat, sieht auf `/auth/forgot` den Hinweis, sich an die Betreiber:in zu wenden; ein Admin erzeugt dann einen Reset-Link (siehe [installation.md, Abschnitt 4](installation.md#4-personen-einladen)).

Mit einem SMTP-Zugang fordern Nutzer:innen den Link selbst an. Die App schickt ihn an die Adresse des Kontos; er gilt **1 Stunde** und nur einmal, ein neuer Link entwertet ältere. Gesperrte Konten bekommen keine Mail.

## Einschalten

1. Beim Mail-Anbieter einen SMTP-Zugang und eine Absenderadresse der eigenen Domain einrichten (SPF/DKIM nach Anleitung des Anbieters), z. B. `noreply@therapia.example.org`.
2. In der `.env` der Installation eintragen:

   ```
   SMTP_HOST=smtp.example.net
   SMTP_PORT=587
   SMTP_USER=<Benutzername>
   SMTP_PASSWORD=<Passwort oder SMTP-Schlüssel>
   MAIL_FROM=theraPiA <noreply@therapia.example.org>
   MAIL_REPLY_TO=kontakt@therapia.example.org
   ```

   `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` und `MAIL_FROM` nur gemeinsam, sonst startet die App nicht (`docker compose logs app` nennt die Ursache). `SMTP_PORT` ist ohne Eintrag `587`. `MAIL_REPLY_TO` ist optional und wirkt nur zusammen mit den vier anderen Werten.
3. `docker compose up -d`.
4. Testen: abmelden, auf der Anmeldeseite „Passwort vergessen?“ wählen, die eigene Adresse eingeben. Die Mail kommt in der Regel innerhalb einer Minute.

## Verschlüsselung

Port `587` nutzt STARTTLS, Port `465` TLS ab Verbindungsbeginn. Die App verschickt in Produktion **nie unverschlüsselt**: Bietet der Server kein STARTTLS an, schlägt der Versand fehl.

## Was die Nutzer:in sieht

Unabhängig davon, ob es zur Adresse ein Konto gibt, antwortet die App immer gleich („Falls ein Konto mit dieser Adresse existiert, ist eine Mail unterwegs.“) – so lässt sich nicht herausfinden, wer registriert ist. Anfragen sind begrenzt: 10 pro Stunde je IP-Adresse, 3 pro Stunde je Mail-Adresse. Die Zähler liegen im Speicher des App-Containers; ein Neustart setzt sie zurück.

## Fehlersuche

Kommt keine Mail an: `docker compose logs app | grep "Passwort vergessen"`. Eine Zeile `Passwort vergessen: Versand fehlgeschlagen: …` heißt, dass beim Anlegen oder Verschicken des Links etwas schiefging. Sie nennt nur die Fehlerart, nie Adresse oder Link.

Fehler beim SMTP-Server:

| Code | Bedeutung |
|---|---|
| `EDNS` | `SMTP_HOST` unbekannt (Tippfehler, DNS) |
| `ESOCKET` | Verbindung abgelehnt oder abgebrochen: falscher Port, Port und TLS-Art passen nicht zusammen, Zertifikatsfehler, Firewall |
| `ETIMEDOUT` | Server antwortet nicht (Firewall, falscher Host oder Port) |
| `ECONNECTION` | Server hat die Verbindung beendet |
| `ETLS` | Verschlüsselung gescheitert, z. B. Server bietet auf Port 587 kein STARTTLS an (siehe [Verschlüsselung](#verschlüsselung)) |
| `EAUTH` | Anmeldung abgelehnt: `SMTP_USER` oder `SMTP_PASSWORD` falsch |
| `EENVELOPE` | Absender oder Empfänger abgelehnt, meist ist `MAIL_FROM` für den Zugang nicht freigegeben |
| `EPROTOCOL` | unerwartete Antwort des Servers, oft ein falscher Port |

Andere Werte kommen meist von der Datenbank: ein Postgres-Code wie `57P01`, `ECONNREFUSED` (Datenbank nicht erreichbar) oder nur ein Fehlername wie `Error`. Dann die übrigen Zeilen in `docker compose logs app` und `docker compose logs db` ansehen.

Ohne Logzeile wurde entweder kein aktives Konto zur Adresse gefunden, die Anfrage wurde vom Limit abgewiesen (die Seite meldet dann „Zu viele Versuche“) oder die Mail ist beim Anbieter angekommen – dann dort im Versandprotokoll und beim Empfang im Spam-Ordner nachsehen.

## Datenschutz

Der Mail-Anbieter verarbeitet die E-Mail-Adresse, den Zeitpunkt und den Link. Die Mail selbst enthält keine Gesundheitsdaten. Der Link ist aber eine Zugangsberechtigung: Wer ihn hat, kann eine Stunde lang ein neues Passwort für ein Konto mit Gesundheitsdaten setzen. Deshalb: AVV mit dem Anbieter, kurze Aufbewahrung im Versandprotokoll, Versand nur verschlüsselt (siehe [Verschlüsselung](#verschlüsselung)). Der Anbieter ist Auftragsverarbeiter – siehe [datenschutz.md](datenschutz.md#mailversand-passwort-vergessen).

## Ausschalten

`SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` und `MAIL_REPLY_TO` leeren oder entfernen, `docker compose up -d`. `MAIL_REPLY_TO` gehört dazu: Allein gesetzt, startet die App nicht. Offene Links bleiben bis zum Ablauf gültig.
