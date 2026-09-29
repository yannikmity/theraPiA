-- Rollen, Sperren und Session-Version für Accounts
ALTER TABLE users ADD COLUMN role VARCHAR NOT NULL DEFAULT 'pia' CHECK (role IN ('admin', 'pia'));
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN disabled_at TIMESTAMPTZ;
UPDATE users SET email = lower(trim(email));

-- Bestehende Instanzen: der älteste Account wird Admin
UPDATE users SET role = 'admin'
WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1);

CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash CHAR(64) NOT NULL UNIQUE,
  email VARCHAR,
  role VARCHAR NOT NULL DEFAULT 'pia' CHECK (role IN ('admin', 'pia')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Verwaiste Datensätze entfernen, dann Fremdschlüssel auf users
DELETE FROM patients WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM supervisors WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM therapy_sessions WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM supervision_sessions WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM financial_settings WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM groups WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM group_sessions WHERE user_id NOT IN (SELECT id FROM users);

ALTER TABLE patients ADD CONSTRAINT patients_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE supervisors ADD CONSTRAINT supervisors_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE therapy_sessions ADD CONSTRAINT therapy_sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE supervision_sessions ADD CONSTRAINT supervision_sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE financial_settings ADD CONSTRAINT financial_settings_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE groups ADD CONSTRAINT groups_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE group_sessions ADD CONSTRAINT group_sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX idx_patients_user_id ON patients(user_id);
CREATE INDEX idx_supervisors_user_id ON supervisors(user_id);
CREATE INDEX idx_therapy_sessions_user_id ON therapy_sessions(user_id);
CREATE INDEX idx_supervision_sessions_user_id ON supervision_sessions(user_id);
CREATE INDEX idx_groups_user_id ON groups(user_id);
CREATE INDEX idx_group_sessions_user_id ON group_sessions(user_id);

-- Nie genutzte Tabellen des NextAuth-Datenbankadapters (die App nutzt JWT-Sessions)
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS verification_tokens;
