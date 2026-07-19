-- 2026-saas-04-programs.sql
-- 지원사업/교육 프로그램: 공고(programs) → 신청(program_applications) → 제출(submissions)

CREATE TABLE IF NOT EXISTS programs (
  id SERIAL PRIMARY KEY,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  apply_start DATE,
  apply_end DATE,
  submit_deadline DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  attachments JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT programs_status_check CHECK (status IN ('draft', 'open', 'closed', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_programs_status ON programs (status);

CREATE TABLE IF NOT EXISTS program_applications (
  id SERIAL PRIMARY KEY,
  program_id INT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'applied',
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT program_applications_unique UNIQUE (program_id, tenant_id),
  CONSTRAINT program_applications_status_check CHECK (status IN ('applied', 'accepted', 'rejected', 'completed'))
);

CREATE INDEX IF NOT EXISTS idx_program_applications_program ON program_applications (program_id);
CREATE INDEX IF NOT EXISTS idx_program_applications_tenant ON program_applications (tenant_id);

CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY,
  program_id INT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title VARCHAR(300),
  note TEXT,
  attachments JSONB NOT NULL DEFAULT '[]',
  status VARCHAR(20) NOT NULL DEFAULT 'submitted',
  feedback TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT submissions_unique UNIQUE (program_id, tenant_id),
  CONSTRAINT submissions_status_check CHECK (status IN ('submitted', 'reviewing', 'approved', 'rejected', 'resubmit_requested'))
);

CREATE INDEX IF NOT EXISTS idx_submissions_program ON submissions (program_id);
CREATE INDEX IF NOT EXISTS idx_submissions_tenant ON submissions (tenant_id);
