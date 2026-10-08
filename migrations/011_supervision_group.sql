-- Gruppenbezug einer Gruppensupervision (#47). Bisher ergab sich die Gruppe nur aus den verknüpften Doppelstunden:
-- Ohne Links (auf der Gruppenseite ohne Doppelstunde angelegt, alle Links entfernt oder alle Doppelstunden gelöscht)
-- gehörte die Supervision zu keiner Gruppe mehr. Jetzt steht die Gruppe fest, unabhängig von den Links.
-- ON DELETE SET NULL: Die App löscht Gruppen bisher nur mit dem Account (dann fällt die Supervision ohnehin weg). Wird
-- eine Gruppe künftig einzeln gelöscht, bleibt die Supervisionszeit erhalten (wie bei #40), nur ohne Gruppenbezug.
-- Wie bei den Link-Tabellen prüft die Anwendung den Besitz der Gruppe vor dem Schreiben.
ALTER TABLE supervision_sessions ADD COLUMN group_id UUID REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE supervision_sessions ADD CONSTRAINT supervision_sessions_group_kind_check
  CHECK (group_id IS NULL OR kind = 'group');
CREATE INDEX idx_supervision_sessions_group_id ON supervision_sessions(group_id);

-- Bestand: die Gruppe der verknüpften Doppelstunden (nur eigene Zeilen). Verweisen die Links auf mehrere Gruppen
-- (über die Supervisionsseite möglich), gewinnt die Gruppe mit den meisten verknüpften Doppelstunden, bei Gleichstand
-- die mit dem frühesten Beginn, dann die ID – so bleibt die Supervision in einer Gruppe sichtbar. Ohne Links bleibt NULL.
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
