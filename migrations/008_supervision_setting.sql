-- Setting einer Supervision: einzeln oder in einer Gruppe von Teilnehmenden wahrgenommen. Unabhängig von `kind`
-- (bespricht Einzeltherapie- oder Gruppentherapie-Sitzungen). Rein additiv: bestehende Supervisionen gelten als Einzel.
ALTER TABLE supervision_sessions ADD COLUMN setting VARCHAR NOT NULL DEFAULT 'einzel'
  CHECK (setting IN ('einzel', 'gruppe'));
