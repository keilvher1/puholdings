-- 2026-saas-01-tenants.sql
-- 입주기업 포털 기반: 입주기업(tenants) + 포털 계정(tenant_users)

CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  business_no VARCHAR(20),
  ceo_name VARCHAR(100),
  room_no VARCHAR(50),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  move_in_date DATE,
  move_out_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenants_status_check CHECK (status IN ('active', 'moved_out'))
);

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants (status);

CREATE TABLE IF NOT EXISTS tenant_users (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 기업당 계정 1개 (createTenantUser의 ON CONFLICT 아비터로도 사용)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_users_tenant_unique ON tenant_users (tenant_id);
