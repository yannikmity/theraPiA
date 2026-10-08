-- Eine Sitzung gehört zu höchstens einer Supervision (#35). Bisher sicherte nur der Primärschlüssel
-- (supervision_id, …_session_id); ein veralteter Tab konnte dieselbe Sitzung einer zweiten Supervision zuordnen, die dann
-- in beiden angerechnet wurde. Die Anwendung prüft das vor dem Speichern (src/lib/db/supervision-sessions.ts); der
-- Unique-Index fängt zwei gleichzeitige Anfragen ab und ersetzt den fehlenden Index auf der Sitzungsspalte.
--
-- Bestand: Doppelte Zuordnungen werden bereinigt statt die Migration abbrechen zu lassen – sonst bliebe eine Instanz
-- beim Update stehen, bis jemand von Hand in der Datenbank aufräumt. Den Link behält bevorzugt eine Supervision desselben
-- Accounts wie die Sitzung (fremde Links gibt es nur über direktes SQL), dann die mit dem frühesten Datum (ab dann gilt
-- die Sitzung als supervidiert), bei gleichem Datum der zuerst gespeicherte Link, danach die kleinere supervision_id.
-- Die übrigen Links fallen weg, ihre Anzahl meldet RAISE NOTICE. Supervisionen bleiben mit Dauer und Anteilen je Fall
-- (supervision_cases) unverändert: ein Anteil ohne verknüpfte Sitzung ist erlaubt und lässt sich beim Bearbeiten
-- entfernen. So geht keine erfasste Supervisionszeit verloren.
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
