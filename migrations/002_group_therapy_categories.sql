-- Patients: Antrag-Tracking (bewilligtes Stundenkontingent ab Antragsdatum)
ALTER TABLE patients ADD COLUMN antragsdatum DATE;
ALTER TABLE patients ADD COLUMN beantragte_stunden INTEGER CHECK (beantragte_stunden IS NULL OR beantragte_stunden > 0);

-- Therapy Sessions: Kategorie (zaehlen alle zu den persoenlichen 600h, aber unterschiedliche Bedeutung fuers Kontingent)
ALTER TABLE therapy_sessions ADD COLUMN category VARCHAR NOT NULL DEFAULT 'behandlung'
  CHECK (category IN ('probatorik', 'behandlung', 'bezugsperson'));

-- Groups Table (Gruppenfachkunde)
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name VARCHAR NOT NULL,
  start_date DATE NOT NULL,
  planned_session_count INTEGER NOT NULL CHECK (planned_session_count > 0),
  avg_kids DECIMAL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Group Sessions Table (Doppelstunden, 100 min)
CREATE TABLE group_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status VARCHAR NOT NULL CHECK (status IN ('durchgefuehrt', 'ausgefallen', 'urlaub', 'geplant')),
  child_count INTEGER CHECK (child_count IS NULL OR child_count >= 0),
  counts_toward_ambulanzzeit BOOLEAN NOT NULL DEFAULT true,
  duration_minutes INTEGER NOT NULL DEFAULT 100 CHECK (duration_minutes > 0),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Supervision Sessions: Unterscheidung Einzel- vs. Gruppen-Supervision
ALTER TABLE supervision_sessions ADD COLUMN kind VARCHAR NOT NULL DEFAULT 'individual'
  CHECK (kind IN ('individual', 'group'));

-- Supervision-Group-Session Links (N:M Relationship, analog zu supervision_therapy_links)
CREATE TABLE supervision_group_session_links (
  supervision_id UUID NOT NULL REFERENCES supervision_sessions(id) ON DELETE CASCADE,
  group_session_id UUID NOT NULL REFERENCES group_sessions(id) ON DELETE CASCADE,
  PRIMARY KEY (supervision_id, group_session_id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes fuer Performance
CREATE INDEX idx_groups_active ON groups(is_active);
CREATE INDEX idx_group_sessions_group_id ON group_sessions(group_id);
CREATE INDEX idx_group_sessions_date ON group_sessions(date);
CREATE INDEX idx_supervision_sessions_kind ON supervision_sessions(kind);
CREATE INDEX idx_therapy_sessions_category ON therapy_sessions(category);
