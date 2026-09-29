-- Ausbildungsregeln (#8): Ausbildungsprofil der Instanz, persönliche Abweichungen je Account, EBM-Staffel mit
-- Gültigkeitsbeginn. Rein additiv: keine bestehende Tabelle oder Zeile ändert sich. Die eingefügten Werte sind die bis
-- dahin festen Werte (src/lib/ausbildungsregeln/model.ts) – nach der Migration zeigt die App exakt dasselbe wie vorher.
-- Grenzen wie REGEL_GRENZEN in src/lib/ausbildungsregeln/validation.ts.

-- Genau eine Zeile je Instanz (id ist immer true). Fehlt sie, gelten die Standardwerte aus dem Code.
CREATE TABLE ausbildungsprofil (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  behandlungsstunden_ziel INTEGER NOT NULL CHECK (behandlungsstunden_ziel BETWEEN 1 AND 2000),
  sv_einheiten_ziel INTEGER NOT NULL CHECK (sv_einheiten_ziel BETWEEN 1 AND 1000),
  verhaeltnis_warnung NUMERIC(3,1) NOT NULL CHECK (verhaeltnis_warnung BETWEEN 1 AND 20),
  verhaeltnis_kritisch NUMERIC(3,1) NOT NULL CHECK (verhaeltnis_kritisch BETWEEN 1 AND 20),
  gruppe_doppelstunden_ziel INTEGER NOT NULL CHECK (gruppe_doppelstunden_ziel BETWEEN 1 AND 500),
  gruppe_ambulanzzeit_ziel INTEGER NOT NULL CHECK (gruppe_ambulanzzeit_ziel BETWEEN 1 AND 500),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ausbildungsprofil_verhaeltnis_folge CHECK (verhaeltnis_kritisch > verhaeltnis_warnung),
  CONSTRAINT ausbildungsprofil_gruppe_folge CHECK (gruppe_ambulanzzeit_ziel <= gruppe_doppelstunden_ziel)
);

INSERT INTO ausbildungsprofil (behandlungsstunden_ziel, sv_einheiten_ziel, verhaeltnis_warnung, verhaeltnis_kritisch,
  gruppe_doppelstunden_ziel, gruppe_ambulanzzeit_ziel)
VALUES (600, 150, 4, 5, 60, 40);

-- Persönliche Abweichungen: NULL = erbt vom Profil. Verhältnis und Gruppenziele nur paarweise, damit jede Zeile für sich
-- gültig bleibt, egal wie das Profil sich ändert. CHECKs mit NULL-Operanden gelten als erfüllt.
CREATE TABLE ausbildungsregeln_abweichungen (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  behandlungsstunden_ziel INTEGER CHECK (behandlungsstunden_ziel BETWEEN 1 AND 2000),
  sv_einheiten_ziel INTEGER CHECK (sv_einheiten_ziel BETWEEN 1 AND 1000),
  verhaeltnis_warnung NUMERIC(3,1) CHECK (verhaeltnis_warnung BETWEEN 1 AND 20),
  verhaeltnis_kritisch NUMERIC(3,1) CHECK (verhaeltnis_kritisch BETWEEN 1 AND 20),
  gruppe_doppelstunden_ziel INTEGER CHECK (gruppe_doppelstunden_ziel BETWEEN 1 AND 500),
  gruppe_ambulanzzeit_ziel INTEGER CHECK (gruppe_ambulanzzeit_ziel BETWEEN 1 AND 500),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT abweichungen_verhaeltnis_paar CHECK ((verhaeltnis_warnung IS NULL) = (verhaeltnis_kritisch IS NULL)),
  CONSTRAINT abweichungen_verhaeltnis_folge CHECK (verhaeltnis_kritisch > verhaeltnis_warnung),
  CONSTRAINT abweichungen_gruppe_paar CHECK ((gruppe_doppelstunden_ziel IS NULL) = (gruppe_ambulanzzeit_ziel IS NULL)),
  CONSTRAINT abweichungen_gruppe_folge CHECK (gruppe_ambulanzzeit_ziel <= gruppe_doppelstunden_ziel)
);

-- EBM-Honorar-Staffel der Gruppe. Maßgeblich ist das Datum der Doppelstunde: es gilt die Staffel mit dem spätesten
-- gueltig_ab bis zu diesem Tag, vor der ältesten die älteste. Die Staffel ab 2000-01-01 deckt alle bestehenden Daten ab.
CREATE TABLE ebm_staffeln (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gueltig_ab DATE NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ebm_staffel_stufen (
  staffel_id UUID NOT NULL REFERENCES ebm_staffeln(id) ON DELETE CASCADE,
  kinderzahl INTEGER NOT NULL CHECK (kinderzahl BETWEEN 1 AND 30),
  honorar_gesamt NUMERIC(8,2) NOT NULL CHECK (honorar_gesamt BETWEEN 0 AND 10000),
  honorar_anteil NUMERIC(8,2) NOT NULL CHECK (honorar_anteil >= 0),
  PRIMARY KEY (staffel_id, kinderzahl),
  CONSTRAINT ebm_stufe_anteil CHECK (honorar_anteil <= honorar_gesamt)
);

WITH staffel AS (
  INSERT INTO ebm_staffeln (gueltig_ab) VALUES ('2000-01-01') RETURNING id
)
INSERT INTO ebm_staffel_stufen (staffel_id, kinderzahl, honorar_gesamt, honorar_anteil)
SELECT staffel.id, v.kinderzahl, v.gesamt, v.anteil
FROM staffel,
  (VALUES (3, 177, 88.5), (4, 200, 100), (5, 225, 112.5), (6, 243, 121.5), (7, 266, 133), (8, 288, 144), (9, 301.5, 150.75))
    AS v(kinderzahl, gesamt, anteil);
