-- Patients Table
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  chiffre VARCHAR NOT NULL,
  therapy_type VARCHAR NOT NULL CHECK (therapy_type IN ('kurzzeittherapie', 'langzeittherapie')),
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, chiffre)
);

-- Supervisors Table
CREATE TABLE supervisors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name VARCHAR NOT NULL,
  cost_per_hour DECIMAL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Therapy Sessions Table
CREATE TABLE therapy_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Supervision Sessions Table
CREATE TABLE supervision_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  supervisor_id UUID NOT NULL REFERENCES supervisors(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Supervision-Therapy Links (N:M Relationship)
CREATE TABLE supervision_therapy_links (
  supervision_id UUID NOT NULL REFERENCES supervision_sessions(id) ON DELETE CASCADE,
  therapy_session_id UUID NOT NULL REFERENCES therapy_sessions(id) ON DELETE CASCADE,
  PRIMARY KEY (supervision_id, therapy_session_id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Financial Settings Table
CREATE TABLE financial_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  income_per_hour DECIMAL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- NextAuth Tables (für Session Management)
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type VARCHAR NOT NULL,
  provider VARCHAR NOT NULL,
  provider_account_id VARCHAR NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,
  token_type VARCHAR,
  scope VARCHAR,
  id_token TEXT,
  session_state VARCHAR,
  UNIQUE(provider, provider_account_id)
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token VARCHAR NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  expires TIMESTAMPTZ NOT NULL
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR,
  email VARCHAR NOT NULL UNIQUE,
  email_verified TIMESTAMPTZ,
  password_hash VARCHAR,
  image VARCHAR,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE verification_tokens (
  identifier VARCHAR NOT NULL,
  token VARCHAR NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- Indexes für Performance
CREATE INDEX idx_patients_active ON patients(is_active);
CREATE INDEX idx_patients_chiffre ON patients(chiffre);
CREATE INDEX idx_therapy_sessions_patient_id ON therapy_sessions(patient_id);
CREATE INDEX idx_therapy_sessions_date ON therapy_sessions(date);
CREATE INDEX idx_supervision_sessions_supervisor_id ON supervision_sessions(supervisor_id);
CREATE INDEX idx_supervision_sessions_date ON supervision_sessions(date);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_users_email ON users(email);
