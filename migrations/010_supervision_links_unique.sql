-- Eine Sitzung gehört zu höchstens einer Supervision (#35). Bisher sicherte nur der Primärschlüssel
-- (supervision_id, …_session_id); ein veralteter Tab konnte dieselbe Sitzung einer zweiten Supervision zuordnen, die dann
-- in beiden angerechnet wurde. Die Anwendung prüft das vor dem Speichern (src/lib/db/supervision-sessions.ts); der
-- Unique-Index fängt zwei gleichzeitige Anfragen ab und ersetzt den fehlenden Index auf der Sitzungsspalte.
--
-- Bestand: Doppelte Zuordnungen werden bereinigt statt die Migration abbrechen zu lassen – sonst bliebe eine Instanz
-- beim Update stehen, bis jemand von Hand in der Datenbank aufräumt. Den Link behält bevorzugt eine Supervision desselben
-- Accounts wie die Sitzung (fremde Links gibt es nur über direktes SQL), dann die mit dem frühesten Datum (ab dann gilt
-- die Sitzung als supervidiert), bei gleichem Datum der zuerst gespeicherte Link, danach die kleinere supervision_id.
-- Die übrigen Links fallen weg, ihre Anzahl meldet RAISE NOTICE. Supervisionen bleiben mit Dauer, Gruppenbezug und
-- Anteilen je Fall (supervision_cases) unverändert: ein Anteil ohne verknüpfte Sitzung ist erlaubt und lässt sich beim
-- Bearbeiten entfernen. So geht keine erfasste Supervisionszeit verloren.

-- Gruppenbezug einer Gruppensupervision (#47, #59): steht hier und nicht erst in 011, weil er vor der Bereinigung
-- festgehalten werden muss. Verliert eine Gruppensupervision unten ihren letzten Link auf eine Doppelstunde, ließe sich
-- ihre Gruppe danach nicht mehr aus den Links ableiten und sie fiele aus dem Gruppendetail. Begründung zu Spalte,
-- Constraint und Befüllung in 011_supervision_group.sql; 011 holt das idempotent für Datenbanken nach, die 010 noch
-- ohne diesen Teil angewendet haben. Namen von Constraint und Index müssen in beiden Dateien gleich bleiben.
ALTER TABLE supervision_sessions ADD COLUMN group_id UUID REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE supervision_sessions ADD CONSTRAINT supervision_sessions_group_kind_check
  CHECK (group_id IS NULL OR kind = 'group');
CREATE INDEX idx_supervision_sessions_group_id ON supervision_sessions(group_id);

-- Befüllung wie in 011, aber aus allen Links vor der Bereinigung (auch denen, die gleich wegfallen).
UPDATE supervision_sessions ss
SET group_id = pick.group_id
FROM (
  SELECT DISTINCT ON (ss.id) ss.id AS supervision_id, g.id AS group_id
  FROM supervision_sessions ss
  JOIN supervision_group_session_links sgsl ON sgsl.supervision_id = ss.id
  JOIN group_sessions gs ON gs.id = sgsl.group_session_id AND gs.user_id = ss.user_id
  JOIN groups g ON g.id = gs.group_id AND g.user_id = ss.user_id
  WHERE ss.kind = 'group'
  GROUP BY ss.id, g.id, g.start_date
  ORDER BY ss.id, count(*) DESC, g.start_date, g.id
) pick
WHERE ss.id = pick.supervision_id;

DO $$
DECLARE
  therapie INTEGER;
  gruppe INTEGER;
BEGIN
  DELETE FROM supervision_therapy_links l
  USING (
    SELECT stl.supervision_id, stl.therapy_session_id,
           row_number() OVER (PARTITION BY stl.therapy_session_id
                              ORDER BY (ts.user_id = ss.user_id) DESC, ss.date, stl.created_at, stl.supervision_id) AS rang
    FROM supervision_therapy_links stl
    JOIN supervision_sessions ss ON ss.id = stl.supervision_id
    JOIN therapy_sessions ts ON ts.id = stl.therapy_session_id
  ) d
  WHERE d.rang > 1 AND l.supervision_id = d.supervision_id AND l.therapy_session_id = d.therapy_session_id;
  GET DIAGNOSTICS therapie = ROW_COUNT;

  DELETE FROM supervision_group_session_links l
  USING (
    SELECT sgl.supervision_id, sgl.group_session_id,
           row_number() OVER (PARTITION BY sgl.group_session_id
                              ORDER BY (gs.user_id = ss.user_id) DESC, ss.date, sgl.created_at, sgl.supervision_id) AS rang
    FROM supervision_group_session_links sgl
    JOIN supervision_sessions ss ON ss.id = sgl.supervision_id
    JOIN group_sessions gs ON gs.id = sgl.group_session_id
  ) d
  WHERE d.rang > 1 AND l.supervision_id = d.supervision_id AND l.group_session_id = d.group_session_id;
  GET DIAGNOSTICS gruppe = ROW_COUNT;

  IF therapie + gruppe > 0 THEN
    RAISE NOTICE 'Migration 010: % doppelte Zuordnungen von Therapiesitzungen und % von Doppelstunden entfernt',
      therapie, gruppe;
  END IF;
END $$;

-- Namen werden in supervision-sessions.ts als Constraint der Unique-Verletzung (23505) erkannt.
CREATE UNIQUE INDEX supervision_therapy_links_therapy_session_id_key ON supervision_therapy_links(therapy_session_id);
CREATE UNIQUE INDEX supervision_group_session_links_group_session_id_key ON supervision_group_session_links(group_session_id);
