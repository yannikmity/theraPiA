-- Anteil je Fall einer Supervision (#40). Bisher wurde die Gesamtdauer zur Laufzeit gleich auf die Fälle der
-- verknüpften Therapiesitzungen verteilt. Fiel die letzte Sitzung eines Falls weg (ON DELETE CASCADE der Links),
-- bekamen die übrigen Fälle dessen Anteil. Jetzt steht der Anteil je Patient:in fest, unabhängig von den Links.
-- Nur Supervisionen von Einzeltherapien (kind = 'individual') haben Anteile; Gruppensupervisionen besprechen
-- Doppelstunden, keine Fälle. Beim Anlegen ist duration_minutes die Summe der Anteile. Wird eine Patient:in gelöscht,
-- fällt nur ihr Anteil weg; die Gesamtdauer bleibt (die Supervision hat stattgefunden). Summe der Anteile ≤
-- duration_minutes, die Differenz ist Zeit ohne vorhandenen Fall (src/lib/db/supervision-sessions.ts, patients.ts).
-- Wie die Link-Tabellen ohne user_id: Besitz prüft die Anwendung vor dem Schreiben (assertSupervisionOwnership).
CREATE TABLE supervision_cases (
  supervision_id UUID NOT NULL REFERENCES supervision_sessions(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  minutes INTEGER NOT NULL CHECK (minutes > 0),
  PRIMARY KEY (supervision_id, patient_id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_supervision_cases_patient_id ON supervision_cases(patient_id);

-- Bestand: die Fälle der verknüpften Sitzungen (nur eigene Zeilen), Gesamtdauer gleich verteilt wie bisher zur
-- Laufzeit. Ganze Minuten; der Rest der Division geht minutenweise an die ersten Fälle nach Chiffre (Textsortierung der
-- Datenbank, „A-10“ vor „A-2“; danach patient_id), damit die Summe
-- exakt der Gesamtdauer entspricht (50 Min, drei Fälle: 17 + 17 + 16). Anteile von 0 Minuten (Dauer kleiner als
-- Fallzahl) entfallen, die Summe stimmt trotzdem. Supervisionen ohne verknüpfte Sitzung bleiben ohne Anteil.
INSERT INTO supervision_cases (supervision_id, patient_id, minutes)
SELECT supervision_id, patient_id, minutes
FROM (
  SELECT f.supervision_id, f.patient_id,
         f.duration_minutes / count(*) OVER w
           + CASE WHEN row_number() OVER (w ORDER BY f.chiffre, f.patient_id) <= f.duration_minutes % count(*) OVER w
                  THEN 1 ELSE 0 END AS minutes
  FROM (
    SELECT DISTINCT ss.id AS supervision_id, ss.duration_minutes, p.id AS patient_id, p.chiffre
    FROM supervision_sessions ss
    JOIN supervision_therapy_links stl ON stl.supervision_id = ss.id
    JOIN therapy_sessions ts ON ts.id = stl.therapy_session_id AND ts.user_id = ss.user_id
    JOIN patients p ON p.id = ts.patient_id AND p.user_id = ss.user_id
    WHERE ss.kind = 'individual'
  ) f
  WINDOW w AS (PARTITION BY f.supervision_id)
) t
WHERE minutes > 0;
