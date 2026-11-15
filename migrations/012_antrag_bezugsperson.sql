-- Antrag getrennt nach Patient:in und Bezugsperson. Kassen genehmigen Behandlungs- und Bezugspersonenstunden als
-- getrennte Kontingente (z. B. KZT 12 + 3, LZT 60 + 15). Bisher gab es nur ein Feld; Bezugspersonenstunden wurden
-- davon nie abgezogen. Rein additiv: bestehende Fälle behalten ihre beantragten Behandlungsstunden, das neue Feld ist
-- NULL, bis es jemand einträgt.
ALTER TABLE patients ADD COLUMN beantragte_bezugsperson_stunden INTEGER
  CHECK (beantragte_bezugsperson_stunden IS NULL OR beantragte_bezugsperson_stunden > 0);
