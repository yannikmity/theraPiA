-- Einzelne Supervisionen ohne Kosten (Pilot-Feedback 2026-11-15: ein Termin der Gruppenfachkunde war kostenlos).
-- Die angerechnete Zeit bleibt; kostenlos setzt nur die Kosten auf 0 (src/lib/calculations.ts, bezahlteMinuten).
-- Additiv: bestehende Supervisionen bleiben kostenpflichtig wie bisher.
ALTER TABLE supervision_sessions ADD COLUMN kostenlos BOOLEAN NOT NULL DEFAULT false;
