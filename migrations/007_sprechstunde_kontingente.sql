-- Sprechstunde und Gesprächsziffer als Kategorien, Genehmigung des Antrags, Sprechstunden der Ambulanzleitung (#66).
-- Rein additiv: bestehende Sitzungen behalten ihre Kategorie, bestehende Patient:innen erhalten NULL bzw. 0.
ALTER TABLE therapy_sessions DROP CONSTRAINT therapy_sessions_category_check;
ALTER TABLE therapy_sessions ADD CONSTRAINT therapy_sessions_category_check
  CHECK (category IN ('sprechstunde', 'probatorik', 'behandlung', 'bezugsperson', 'gespraechsziffer'));

-- Behandlungsstunden des Antrags zählen ab Genehmigung durch die Kasse; ohne Datum wie bisher ab Antragsdatum.
ALTER TABLE patients ADD COLUMN genehmigungsdatum DATE;
-- Von den 10 Sprechstunden je Fall übernimmt die Ambulanzleitung oft einige; sie fehlen im eigenen Kontingent.
ALTER TABLE patients ADD COLUMN sprechstunden_ambulanz INTEGER NOT NULL DEFAULT 0
  CHECK (sprechstunden_ambulanz BETWEEN 0 AND 10);
