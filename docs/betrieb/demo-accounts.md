# Demo-Zugänge

Ein Demo-Zugang ist ein normaler PiA-Account, der bei der Registrierung mit fiktiven Beispieldaten startet. So sehen Interessierte – PiA, Institutsleitungen, Softwarepartner – sofort ein gefülltes Dashboard mit Prognose, Patient:innen, Supervision, einer Gruppe und einen Nachweis, ohne dass echte Daten im Spiel sind.

## Demo-Zugang anlegen

1. Als Admin **Profil → Administration** öffnen, Karte **Einladen**.
2. Rolle **PiA** wählen, optional die E-Mail-Adresse der Person eintragen (bindet die Einladung an diese Adresse).
3. Häkchen **Mit Beispieldaten starten (Demo-Zugang)** setzen und **Einladungslink erzeugen**.
4. Der **Demo-Einladungslink (14 Tage gültig, mit Beispieldaten)** gilt wie jede Einladung einmal; vertraulich weitergeben. In der Liste „Offene Einladungen“ steht bei ihm „mit Beispieldaten“.

Wer sich über den Link registriert, findet nach der Anmeldung einen gefüllten Account vor. Einzelheiten:

- **Nur für PiA.** Für die Rolle Administration ist das Häkchen gesperrt: Ein Demo-Admin sähe die echten Accounts der Instanz.
- **Nur über die Einladung.** Ob ein Account Beispieldaten bekommt, entscheidet allein die Einladung auf dem Server; das Registrierungsformular kann es nicht beeinflussen.
- **Adresse schon vergeben:** Dann entsteht wie bei jeder Einladung kein neuer Account, der Link ist verbraucht, und der bestehende Account bleibt unverändert – er bekommt keine Beispieldaten.
- **Alles oder nichts:** Account und Beispieldaten entstehen in einem Schritt. Scheitert das, gibt es keinen Account und der Link gilt weiter.

## Was angelegt wird

Alle Daten liegen relativ zum Tag der Registrierung (Kalendertag in Europe/Berlin) und sind erfunden:

| Bereich | Inhalt |
|---|---|
| Patient:innen | 5 Chiffren (`A-1041` bis `E-5119`): drei laufende Langzeittherapien, eine abgeschlossene Kurzzeittherapie, eine gerade begonnene Therapie; Antragsdaten und beantragte Behandlungsstunden bei vier von ihnen |
| Therapiesitzungen | 159 Sitzungen à 50 Minuten über gut ein Jahr (sechs Quartale), mit Probatorik und Bezugspersonen-Stunden |
| Supervision | „Supervisor:in A“ und „Supervisor:in B“, 32 Einzel- und 7 Gruppensupervisionen; einige Sitzungen noch unbesprochen |
| Gruppe | „Gruppe Beispiel“ mit 32 Doppelstunden, davon 2 in den nächsten Tagen geplant |
| Finanzen | Honorar 70 EUR je Behandlungsstunde, Prognose nach dem Schnitt der letzten Wochen |

Mit den Standard-Ausbildungsregeln zeigt die App alle Zustände: Verhältnis insgesamt im Soll, eine Patient:in „knapp“, eine ohne Supervision. Weichen Ausbildungsprofil oder EBM-Staffel der Instanz vom Standard ab ([installation.md, Abschnitt 9](installation.md#9-ausbildungsregeln)), rechnet der Demo-Zugang mit diesen Werten – die Anzeige kann dann anders aussehen.

Die Daten wandern später nicht mit: Nach einigen Wochen wirkt ein Demo-Zugang veraltet (Prognose, „Wie letzte Woche“). Dann lieber einen neuen Demo-Zugang anlegen und den alten löschen.

## Demo-Accounts erkennen

- Oben auf jeder Seite der App steht: „Demo-Account: Alle Daten hier sind fiktive Beispieldaten. Bitte keine echten Daten erfassen.“ Der Hinweis erscheint auch auf dem gedruckten Nachweis.
- In der Administration trägt der Account in der Liste „Accounts“ das Badge **Demo**.
- Per SQL (Konsole wie in [installation.md, Abschnitt 7](installation.md#7-fehlersuche)):

  ```sql
  SELECT name, email, created_at FROM users WHERE is_demo ORDER BY created_at;
  ```

## Demo-Accounts löschen

Ein Demo-Account lässt sich wie jeder Account löschen; mit ihm verschwinden alle Beispieldaten.

- **Durch die Person selbst:** Profil → Meine Daten → Account löschen.
- **Durch die Betreiber:in:** zuerst sperren (Profil → Administration), endgültig löschen über den SQL-Notfallweg in [datenschutz.md](datenschutz.md#export-und-löschung).

Demo-Zugänge nach der Vorführung oder Testphase löschen – sie tragen Name und E-Mail-Adresse einer echten Person.

## Datenschutz

- Die Beispieldaten sind fiktiv; **Name und E-Mail-Adresse** des Demo-Accounts sind es nicht. Für sie gelten dieselben Datenschutzhinweise wie für jeden Account.
- Der Hinweis in der App bittet, keine echten Daten zu erfassen – verhindern kann er es nicht. Für Vorführungen bei Dritten (Vertrieb, Softwarepartner) eine eigene Demo-Instanz neben der produktiven betreiben ([mehrere-instanzen.md](mehrere-instanzen.md)).
- Feedback aus dem Widget und die optionale Nutzungsstatistik funktionieren in Demo-Accounts wie in allen anderen.

## Technik

Migration `006_demo_accounts.sql` ergänzt `invitations.with_demo_data` und `users.is_demo` (beide Standard `false`). Die Beispieldaten erzeugt `src/lib/demo/demo-daten.mjs` aus dem Registrierungstag; `src/lib/demo/demo-daten-db.mjs` schreibt sie in derselben Datenbank-Transaktion wie den Account.
