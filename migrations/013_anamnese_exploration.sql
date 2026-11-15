-- Kategorien Anamnese und Vertiefte Exploration. Anamnese: eine Sitzung à 50 Min je Fall, zu Beginn (in der Probatorik).
-- Vertiefte Exploration: zwei Ziffern à 20 Min je Quartal und Fall. Beide zählen wie alle Kategorien zu den persönlichen
-- Behandlungsstunden, nicht zum Antrags-Kontingent. Rein additiv: bestehende Sitzungen behalten ihre Kategorie.
ALTER TABLE therapy_sessions DROP CONSTRAINT therapy_sessions_category_check;
ALTER TABLE therapy_sessions ADD CONSTRAINT therapy_sessions_category_check
  CHECK (category IN ('sprechstunde', 'probatorik', 'anamnese', 'behandlung', 'bezugsperson', 'gespraechsziffer', 'exploration'));
