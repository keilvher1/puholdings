-- 2026-expense-03-fx-payroll.sql
-- 사업비 정산: (1) 인건비 수기 등록(원본 파일 없이 저장 가능) (2) 외화 증빙의 결제일 기준 환율 환산.
-- - 외화 증빙은 total_amount(원화, 원 단위 정수)에 환산 결과를 저장하고, 원래 외화 금액·적용 환율·환율 기준일·출처를 함께 남긴다.
-- - 파일 없는 행은 doc_type 'payroll'(인건비 지급)만 허용한다.
-- - expense_fx_rates: 같은 (통화, 요청일, 출처) 환율을 다시 조회하지 않도록 캐시한다(오늘·미래 날짜는 저장하지 않는다).
-- 멱등: 여러 번 실행해도 안전하다. 기존 데이터는 그대로 둔다(기존 행은 currency 'KRW'가 된다).
-- 2026-expense-01.sql, 2026-expense-02-inbox.sql 다음에 실행한다.

ALTER TABLE expense_receipts ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'KRW';
ALTER TABLE expense_receipts ADD COLUMN IF NOT EXISTS foreign_amount NUMERIC(14,2);           -- 외화 합계(원화 증빙이면 NULL)
ALTER TABLE expense_receipts ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(14,6);            -- 1 외화 단위당 원
ALTER TABLE expense_receipts ADD COLUMN IF NOT EXISTS exchange_rate_date DATE;                -- 실제 적용한 환율의 기준일
ALTER TABLE expense_receipts ADD COLUMN IF NOT EXISTS exchange_rate_source VARCHAR(12) NOT NULL DEFAULT '';  -- ''|ecb|koreaexim|manual
ALTER TABLE expense_receipts ADD COLUMN IF NOT EXISTS payroll_month CHAR(7);                  -- 인건비 귀속월 'YYYY-MM'

-- 인건비 수기 등록은 원본 파일이 없다.
ALTER TABLE expense_receipts ALTER COLUMN file_pathname DROP NOT NULL;

ALTER TABLE expense_receipts DROP CONSTRAINT IF EXISTS expense_receipts_doc_type_check;
ALTER TABLE expense_receipts ADD CONSTRAINT expense_receipts_doc_type_check
  CHECK (doc_type IN ('receipt', 'card_slip', 'tax_invoice', 'invoice', 'transfer', 'payroll', 'other'));

ALTER TABLE expense_receipts DROP CONSTRAINT IF EXISTS expense_receipts_file_required_check;
ALTER TABLE expense_receipts ADD CONSTRAINT expense_receipts_file_required_check
  CHECK (file_pathname IS NOT NULL OR doc_type = 'payroll');

ALTER TABLE expense_receipts DROP CONSTRAINT IF EXISTS expense_receipts_currency_check;
ALTER TABLE expense_receipts ADD CONSTRAINT expense_receipts_currency_check
  CHECK (currency = 'KRW' OR (COALESCE(foreign_amount, 0) > 0 AND COALESCE(exchange_rate, 0) > 0));  -- NULL이면 CHECK가 통과하므로 COALESCE

ALTER TABLE expense_receipts DROP CONSTRAINT IF EXISTS expense_receipts_fx_source_check;
ALTER TABLE expense_receipts ADD CONSTRAINT expense_receipts_fx_source_check
  CHECK (exchange_rate_source IN ('', 'ecb', 'koreaexim', 'manual'));

ALTER TABLE expense_receipts DROP CONSTRAINT IF EXISTS expense_receipts_payroll_month_check;
ALTER TABLE expense_receipts ADD CONSTRAINT expense_receipts_payroll_month_check
  CHECK (payroll_month IS NULL OR payroll_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

CREATE TABLE IF NOT EXISTS expense_fx_rates (
  currency CHAR(3) NOT NULL,
  requested_date DATE NOT NULL,         -- 요청한 날짜(결제일)
  source VARCHAR(12) NOT NULL,          -- ecb | koreaexim
  rate NUMERIC(14,6) NOT NULL,          -- 1 외화 단위당 원
  rate_date DATE NOT NULL,              -- 실제 고시일(주말·휴일이면 직전 영업일)
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (currency, requested_date, source)
);
