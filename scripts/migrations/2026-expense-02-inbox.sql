-- 2026-expense-02-inbox.sql
-- 사업비 정산: 데스크톱 앱(포연기 증빙함)이 올린 증빙의 확인 대기함.
-- 흐름: 앱에 파일을 끌어다 놓음 → 서버가 원본 보관(Blob private) + 자동 인식 → 이 표에 pending으로 저장
--       → 웹 '증빙 올리기' 화면에서 관리자가 확인·수정·프로젝트 선택 후 저장(expense_receipts) → done.
-- 인식 결과는 제안일 뿐이며, 이 표에서 증빙 장부(expense_receipts)로 자동으로 옮기지 않는다.
-- 멱등: 여러 번 실행해도 안전하다(추가만). 2026-expense-01.sql 다음에 실행한다.

CREATE TABLE IF NOT EXISTS expense_inbox (
  id SERIAL PRIMARY KEY,
  source VARCHAR(20) NOT NULL DEFAULT 'desktop',
  -- 원본 파일(Blob private, expenses/receipts/YYYY-MM/...)
  file_pathname TEXT NOT NULL,
  file_name VARCHAR(300) NOT NULL,
  file_type VARCHAR(100) NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  file_hash VARCHAR(64) NOT NULL DEFAULT '',                  -- sha256 hex(원본 기준), 중복 감지용
  preferred_project_id INTEGER REFERENCES expense_projects(id) ON DELETE SET NULL,  -- 앱에서 고른 기본 프로젝트
  status VARCHAR(12) NOT NULL DEFAULT 'pending',
  scan_status VARCHAR(16) NOT NULL DEFAULT 'ok',
  drafts JSONB NOT NULL DEFAULT '[]'::jsonb,                  -- ReceiptDraft[] (인식 제안값)
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,                -- 파일 전체 경고
  duplicates JSONB NOT NULL DEFAULT '[]'::jsonb,              -- 같은 파일로 이미 저장된 증빙
  possible_duplicates JSONB NOT NULL DEFAULT '[]'::jsonb,     -- 같은 거래로 보이는 저장된 증빙(drafts와 같은 순서)
  error TEXT NOT NULL DEFAULT '',                             -- 인식 실패 사유
  created_by INTEGER,                                         -- 올린 관리자 id(세션)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expense_inbox_status_check CHECK (status IN ('pending', 'done', 'dismissed')),
  CONSTRAINT expense_inbox_scan_status_check CHECK (scan_status IN ('ok', 'failed', 'not_configured'))
);

CREATE INDEX IF NOT EXISTS idx_expense_inbox_status ON expense_inbox (status, created_at DESC);
