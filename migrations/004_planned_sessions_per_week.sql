-- Quartalsprognose (Dashboard, #6): geplante Sitzungen pro Woche. NULL = Schnitt der letzten Wochen.
ALTER TABLE financial_settings ADD COLUMN planned_sessions_per_week INTEGER
  CHECK (planned_sessions_per_week IS NULL OR planned_sessions_per_week BETWEEN 0 AND 60);
