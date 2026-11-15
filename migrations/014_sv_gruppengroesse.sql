-- Supervision in der SV-Gruppe: Wer zu mehreren supervidiert, darf sich die Fallvorstellungen der anderen auf den eigenen
-- Fall anrechnen lassen, zahlt aber nur den eigenen Anteil (z. B. zu zweit: 50 Min angerechnet, 25 Min bezahlt).
-- duration_minutes bleibt die angerechnete Zeit; gruppengroesse teilt nur die Kosten. NULL = bisheriges Verhalten
-- (Kosten für die ganze Dauer). Rein additiv.
ALTER TABLE supervision_sessions ADD COLUMN gruppengroesse SMALLINT
  CHECK (gruppengroesse IS NULL OR gruppengroesse BETWEEN 2 AND 10);
