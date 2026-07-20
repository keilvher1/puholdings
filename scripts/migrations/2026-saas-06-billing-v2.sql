-- 2026-saas-06-billing-v2.sql
-- 관리비 전면 개편: 호실 계약 기반 임대료 + 건물 전기료 3단 배분 구조로 교체.
--
-- ⚠ 아래 기존 관리비 4개 테이블을 DROP한다. 실행 전 행 수를 반드시 확인할 것.
--   (2026-07-20 기준: billing_items 4행=테스트 시드만 존재, meter_readings/bills/bill_lines 0행
--    → 실 청구 데이터 없음, DROP 안전 판단. 실데이터가 있으면 백업 후 진행하고 이 주석을 갱신할 것.)
-- 관리비 외 테이블(tenants, email_*, programs, submissions, content_* 등)은 절대 건드리지 않는다.

-- ---------- 기존 관리비 테이블 제거 (의존 순서: 자식 → 부모) ----------
-- 재실행 안전 가드: 구버전 마커인 billing_items가 존재할 때만 DROP한다.
-- (v2 적용 후 billing_items는 사라지므로, 재실행 시 새 bills/meter_readings를 지우지 않는다)
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'billing_items') THEN
    DROP TABLE IF EXISTS bill_lines CASCADE;
    DROP TABLE IF EXISTS bills CASCADE;
    DROP TABLE IF EXISTS meter_readings CASCADE;
    DROP TABLE IF EXISTS billing_items CASCADE;
  END IF;
END
$do$;

-- ---------- tenants 확장 (세금계산서 메일·담당자·과오입금 잔액) ----------
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tax_email VARCHAR(255);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS manager_name VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS overpaid_balance NUMERIC(12,0) NOT NULL DEFAULT 0;

-- ---------- 호실 ----------
CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  building VARCHAR(20) NOT NULL,
  floor INT,
  area_m2 NUMERIC(8,2),
  pyeong NUMERIC(6,1),
  status VARCHAR(20) NOT NULL DEFAULT 'available',
  memo TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT rooms_building_check CHECK (building IN ('본관', '공장동')),
  CONSTRAINT rooms_status_check CHECK (status IN ('available', 'maintenance'))
);
CREATE INDEX IF NOT EXISTS idx_rooms_building ON rooms (building, sort_order);

-- ---------- 계약 (기업 × 호실) ----------
CREATE TABLE IF NOT EXISTS contracts (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  room_id INT NOT NULL REFERENCES rooms(id),
  contract_date DATE,
  start_date DATE,
  renewal_type VARCHAR(10) NOT NULL DEFAULT 'renewal',
  pyeong_billed NUMERIC(6,1) NOT NULL,
  pyeong_actual NUMERIC(6,1),
  rent_unit_price NUMERIC(12,0) NOT NULL,
  mgmt_fee NUMERIC(12,0) NOT NULL DEFAULT 15000,
  deposit_standard NUMERIC(12,0),
  deposit_actual NUMERIC(12,0),
  elec_method VARCHAR(10) NOT NULL DEFAULT 'area',
  status VARCHAR(10) NOT NULL DEFAULT 'active',
  ended_at DATE,
  first_month_billing VARCHAR(10) NOT NULL DEFAULT 'full',
  last_month_billing VARCHAR(10) NOT NULL DEFAULT 'full',
  deposit_returned_at DATE,
  deposit_returned_amount NUMERIC(12,0),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contracts_renewal_check CHECK (renewal_type IN ('renewal', 'new')),
  CONSTRAINT contracts_elec_check CHECK (elec_method IN ('area', 'metered')),
  CONSTRAINT contracts_status_check CHECK (status IN ('active', 'ended')),
  CONSTRAINT contracts_first_check CHECK (first_month_billing IN ('full', 'prorated', 'none')),
  CONSTRAINT contracts_last_check CHECK (last_month_billing IN ('full', 'prorated', 'none'))
);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON contracts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_contracts_room ON contracts (room_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts (status);

-- ---------- 계량기 (공장동) ----------
CREATE TABLE IF NOT EXISTS meters (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  code VARCHAR(10) UNIQUE NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);
INSERT INTO meters (name, code, sort_order) VALUES
  ('공장동 전체', 'MAIN', 1),
  ('F101', 'F101', 2),
  ('F103', 'F103', 3),
  ('냉난방기', 'HVAC', 4)
ON CONFLICT (code) DO NOTHING;

-- ---------- 계량기 지침 (누적) ----------
CREATE TABLE IF NOT EXISTS meter_readings (
  id SERIAL PRIMARY KEY,
  meter_id INT NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
  period CHAR(7) NOT NULL,
  reading NUMERIC(12,1) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT meter_readings_unique UNIQUE (meter_id, period)
);
CREATE INDEX IF NOT EXISTS idx_meter_readings_period ON meter_readings (period);

-- ---------- 월별 전기료 파라미터 (전기 사용월 기준) ----------
CREATE TABLE IF NOT EXISTS billing_periods (
  id SERIAL PRIMARY KEY,
  period CHAR(7) UNIQUE NOT NULL,
  elec_total NUMERIC(12,0),
  elec_unit_price NUMERIC(8,2) NOT NULL DEFAULT 102,
  area_ratio NUMERIC(4,2) NOT NULL DEFAULT 0.70,
  per10_calc NUMERIC(12,2),
  per10_billed NUMERIC(12,0),
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_periods_status_check CHECK (status IN ('open', 'generated', 'issued', 'closed'))
);

-- ---------- 청구서 (청구월 기준) ----------
CREATE TABLE IF NOT EXISTS bills (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period CHAR(7) NOT NULL,
  rent_total NUMERIC(12,0) NOT NULL DEFAULT 0,
  mgmt_total NUMERIC(12,0) NOT NULL DEFAULT 0,
  supply_amount NUMERIC(12,0) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(12,0) NOT NULL DEFAULT 0,
  elec_amount NUMERIC(12,0) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,0) NOT NULL DEFAULT 0,
  status VARCHAR(10) NOT NULL DEFAULT 'draft',
  is_manual BOOLEAN NOT NULL DEFAULT FALSE,
  due_date DATE,
  issued_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  invoice_pathname VARCHAR(500),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bills_unique UNIQUE (tenant_id, period),
  CONSTRAINT bills_status_check CHECK (status IN ('draft', 'issued', 'paid', 'overdue'))
);
CREATE INDEX IF NOT EXISTS idx_bills_period ON bills (period);
CREATE INDEX IF NOT EXISTS idx_bills_tenant ON bills (tenant_id);

-- ---------- 청구서 항목 ----------
CREATE TABLE IF NOT EXISTS bill_lines (
  id SERIAL PRIMARY KEY,
  bill_id INT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  contract_id INT REFERENCES contracts(id) ON DELETE SET NULL,
  room_code VARCHAR(20),
  line_type VARCHAR(20) NOT NULL,
  label VARCHAR(200),
  quantity NUMERIC(12,2),
  unit_price NUMERIC(12,2),
  amount NUMERIC(12,0) NOT NULL DEFAULT 0,
  CONSTRAINT bill_lines_type_check CHECK (line_type IN ('rent', 'mgmt', 'elec_area', 'elec_metered', 'manual'))
);
CREATE INDEX IF NOT EXISTS idx_bill_lines_bill ON bill_lines (bill_id);
