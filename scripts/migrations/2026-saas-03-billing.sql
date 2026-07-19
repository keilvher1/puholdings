-- 2026-saas-03-billing.sql
-- 관리비: 항목(billing_items), 검침(meter_readings), 청구서(bills, bill_lines)

CREATE TABLE IF NOT EXISTS billing_items (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  unit VARCHAR(20),
  unit_price NUMERIC(12,2),
  is_metered BOOLEAN NOT NULL DEFAULT FALSE,
  default_amount NUMERIC(12,0),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS meter_readings (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id INT NOT NULL REFERENCES billing_items(id),
  period CHAR(7) NOT NULL,
  prev_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  curr_value NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT meter_readings_unique UNIQUE (tenant_id, item_id, period),
  CONSTRAINT meter_readings_curr_gte_prev CHECK (curr_value >= prev_value)
);

CREATE INDEX IF NOT EXISTS idx_meter_readings_period ON meter_readings (period);

CREATE TABLE IF NOT EXISTS bills (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period CHAR(7) NOT NULL,
  total_amount NUMERIC(12,0) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  due_date DATE,
  issued_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bills_unique UNIQUE (tenant_id, period),
  CONSTRAINT bills_status_check CHECK (status IN ('draft', 'issued', 'paid', 'overdue'))
);

CREATE INDEX IF NOT EXISTS idx_bills_period ON bills (period);
CREATE INDEX IF NOT EXISTS idx_bills_tenant ON bills (tenant_id);

CREATE TABLE IF NOT EXISTS bill_lines (
  id SERIAL PRIMARY KEY,
  bill_id INT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  item_id INT REFERENCES billing_items(id) ON DELETE SET NULL,
  label VARCHAR(100) NOT NULL,
  quantity NUMERIC(12,2),
  unit_price NUMERIC(12,2),
  amount NUMERIC(12,0) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_bill_lines_bill ON bill_lines (bill_id);

-- ---------- 기본 항목 시드 ----------

INSERT INTO billing_items (name, unit, unit_price, is_metered, default_amount, sort_order) VALUES
  ('전기세', 'kWh', 130.00, TRUE, NULL, 1)
  ON CONFLICT (name) DO NOTHING;
INSERT INTO billing_items (name, unit, unit_price, is_metered, default_amount, sort_order) VALUES
  ('수도세', '톤', 850.00, TRUE, NULL, 2)
  ON CONFLICT (name) DO NOTHING;
INSERT INTO billing_items (name, unit, unit_price, is_metered, default_amount, sort_order) VALUES
  ('임대료', NULL, NULL, FALSE, 300000, 3)
  ON CONFLICT (name) DO NOTHING;
INSERT INTO billing_items (name, unit, unit_price, is_metered, default_amount, sort_order) VALUES
  ('공용관리비', NULL, NULL, FALSE, 100000, 4)
  ON CONFLICT (name) DO NOTHING;

-- ---------- bill_issued 메일 템플릿에 항목 내역 표 추가 ----------
-- (관리자가 템플릿을 수정한 경우에도 이 마이그레이션 재실행 시 아래 본문으로 덮어쓴다)

UPDATE email_templates SET body_html = '<div style="max-width:600px;margin:0 auto;padding:32px 24px;font-family:sans-serif;color:#333;background:#ffffff;">
  <h2 style="margin:0 0 20px;color:#1a1a2e;border-bottom:2px solid #c9a227;padding-bottom:12px;font-size:20px;">{{bill_month}} 청구서 발행 안내</h2>
  <p style="line-height:1.7;">{{tenant_name}} 담당자님, 안녕하세요.<br>포항연합기술지주 창업보육센터입니다.</p>
  <p style="line-height:1.7;">{{bill_month}} 청구서가 발행되었습니다. 항목별 내역은 아래와 같습니다.</p>
  {{lines_html}}
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;width:130px;font-weight:bold;">합계</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;font-weight:bold;">{{amount}}원</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;font-weight:bold;">납부 기한</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;">{{due_date}}</td>
    </tr>
  </table>
  <p style="margin:24px 0;"><a href="{{portal_url}}" style="display:inline-block;background:#1a1a2e;color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:4px;font-size:14px;">포털에서 청구서 확인</a></p>
  <p style="margin-top:28px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#999;">본 메일은 발신 전용입니다. 문의사항은 포항연합기술지주 창업보육센터로 연락해 주세요.</p>
</div>', updated_at = now() WHERE code = 'bill_issued';
