CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('patient', 'doctor', 'admin', 'staff')),
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date_of_birth DATE,
  sex TEXT,
  medical_history TEXT,
  allergies TEXT
);

CREATE TABLE IF NOT EXISTS doctors (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  specialty TEXT NOT NULL,
  license_number TEXT,
  bio TEXT,
  stripe_account_id TEXT,
  razorpay_account_id TEXT,
  consult_fee_cents INTEGER NOT NULL DEFAULT 8000,
  oversight_fee_cents INTEGER NOT NULL DEFAULT 800,
  clinic_start TEXT NOT NULL DEFAULT '09:00',
  clinic_end TEXT NOT NULL DEFAULT '17:00',
  slot_minutes INTEGER NOT NULL DEFAULT 30
);

CREATE TABLE IF NOT EXISTS triage_sessions (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  chief_complaint TEXT,
  messages JSONB NOT NULL DEFAULT '[]',
  severity TEXT CHECK (severity IN ('high', 'low')),
  risk_score INTEGER,
  red_flags JSONB NOT NULL DEFAULT '[]',
  ai_summary TEXT,
  recommended_action TEXT,
  care_plan TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id TEXT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  triage_session_id TEXT REFERENCES triage_sessions(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  severity TEXT NOT NULL CHECK (severity IN ('high', 'low')),
  status TEXT NOT NULL DEFAULT 'scheduled',
  reason TEXT,
  bump_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_consults (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id TEXT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  triage_session_id TEXT REFERENCES triage_sessions(id),
  advice TEXT,
  status TEXT NOT NULL DEFAULT 'pending_oversight',
  doctor_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id TEXT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  appointment_id TEXT REFERENCES appointments(id),
  ai_consult_id TEXT REFERENCES ai_consults(id),
  kind TEXT NOT NULL CHECK (kind IN ('appointment', 'oversight')),
  amount_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  doctor_payout_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  provider TEXT NOT NULL DEFAULT 'mock',
  provider_ref TEXT,
  transfer_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_doctor_time ON appointments (doctor_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_severity ON appointments (severity, created_at);
CREATE INDEX IF NOT EXISTS idx_triage_patient ON triage_sessions (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_doctor ON payments (doctor_id, created_at DESC);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('patient', 'doctor', 'admin', 'staff'));

CREATE TABLE IF NOT EXISTS staff_assists (
  id TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id TEXT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  staff_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  protocol TEXT NOT NULL DEFAULT 'bridge_high_risk_wait',
  notes TEXT,
  vitals JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_staff_assists_status ON staff_assists (status, created_at DESC);

ALTER TABLE doctors ALTER COLUMN slot_minutes SET DEFAULT 30;
ALTER TABLE appointments ALTER COLUMN duration_minutes SET DEFAULT 30;
UPDATE doctors SET slot_minutes = 30;
UPDATE appointments SET duration_minutes = 30 WHERE status IN ('scheduled', 'pending_payment', 'waitlisted');
