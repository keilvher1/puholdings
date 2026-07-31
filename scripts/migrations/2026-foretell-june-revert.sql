-- 포어텔 6월분 재정정: 계산식·발행 PDF 기준 1,155,540원(203호 42,540, 단가 21,270)이 맞음.
-- 1,169,600원은 단가 갱신(28,300) 후 엑셀 재계산으로 보이는 값(HEM 1,253,300과 동일 현상).
UPDATE bills SET status = 'draft', paid_at = NULL, updated_at = NOW()
WHERE period = '2026-06'
  AND tenant_id IN (SELECT id FROM tenants WHERE name LIKE '%포어텔%');
