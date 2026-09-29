-- Demo-Accounts (#9): Eine Einladung kann „mit Beispieldaten starten“; der darüber registrierte Account bleibt als
-- Demo-Account erkennbar (Hinweis in der App, Badge in der Administration). Rein additiv: bestehende Einladungen
-- und Accounts erhalten false, ältere Versionen der App ignorieren die Spalten.
ALTER TABLE invitations ADD COLUMN with_demo_data BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false;
