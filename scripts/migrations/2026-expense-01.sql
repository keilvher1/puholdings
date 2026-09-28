-- 2026-expense-01.sql
-- 사업비 정산(AI 증빙 관리): 사업·프로젝트와 증빙(영수증·카드전표·세금계산서 등)
-- 흐름: 프로젝트 등록 → 증빙 업로드 → AI OCR 제안값 → 관리자 확인·수정·프로젝트 선택 후 저장.
-- 멱등: 여러 번 실행해도 안전하다.

CREATE TABLE IF NOT EXISTS expense_projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,                        -- 프로젝트(과제)명
  program_name VARCHAR(200) NOT NULL DEFAULT '',     -- 상위 지원사업명
  agency VARCHAR(200) NOT NULL DEFAULT '',           -- 주관·전담 기관
  description TEXT NOT NULL DEFAULT '',
  start_date DATE,
  end_date DATE,
  total_budget NUMERIC(12,0),                        -- 총사업비(원)
  budget_items JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ name, amount }] 비목별 예산
  source_files JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ name, pathname, size, type }] AI 분석에 쓴 사업 자료
  status VARCHAR(10) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expense_projects_status_check CHECK (status IN ('active', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_expense_projects_status ON expense_projects (status, created_at DESC);

CREATE TABLE IF NOT EXISTS expense_receipts (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES expense_projects(id) ON DELETE RESTRICT,
  doc_type VARCHAR(20) NOT NULL DEFAULT 'receipt',
  issue_date DATE NOT NULL,                          -- 거래일자
  vendor_name VARCHAR(200) NOT NULL,                 -- 거래처(가맹점)
  vendor_biz_no VARCHAR(20) NOT NULL DEFAULT '',     -- 사업자등록번호 NNN-NN-NNNNN
  supply_amount NUMERIC(12,0),                       -- 공급가액
  vat_amount NUMERIC(12,0),                          -- 부가세
  total_amount NUMERIC(12,0) NOT NULL,               -- 합계(결제 금액)
  payment_method VARCHAR(10) NOT NULL DEFAULT 'card',
  approval_no VARCHAR(50) NOT NULL DEFAULT '',       -- 카드 승인번호·국세청 승인번호 등
  items JSONB NOT NULL DEFAULT '[]'::jsonb,          -- [{ name, quantity, unit_price, amount }]
  budget_item VARCHAR(100) NOT NULL DEFAULT '',      -- 비목
  purpose TEXT NOT NULL DEFAULT '',                  -- 적요
  memo TEXT NOT NULL DEFAULT '',
  -- 원본 파일(Blob private, expenses/receipts/...). 한 파일에 증빙이 여러 장이면 여러 행이 같은 파일을 공유한다.
  file_pathname TEXT NOT NULL,
  file_name VARCHAR(300) NOT NULL,
  file_type VARCHAR(100) NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  file_hash VARCHAR(64) NOT NULL DEFAULT '',         -- sha256 hex, 중복 업로드 감지용
  ai_confidence VARCHAR(10),
  ai_raw JSONB,                                      -- 감사용 AI 원본 초안
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expense_receipts_doc_type_check
    CHECK (doc_type IN ('receipt', 'card_slip', 'tax_invoice', 'invoice', 'transfer', 'other')),
  CONSTRAINT expense_receipts_payment_method_check
    CHECK (payment_method IN ('card', 'cash', 'transfer', 'other')),
  CONSTRAINT expense_receipts_ai_confidence_check
    CHECK (ai_confidence IS NULL OR ai_confidence IN ('high', 'medium', 'low'))
);

CREATE INDEX IF NOT EXISTS idx_expense_receipts_project_date ON expense_receipts (project_id, issue_date);
CREATE INDEX IF NOT EXISTS idx_expense_receipts_file_hash ON expense_receipts (file_hash);
