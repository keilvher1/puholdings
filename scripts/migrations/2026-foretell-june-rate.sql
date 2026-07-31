-- 포어텔마이헬스 6월분 정정 준비: 실발행 청구서는 203호 전기 56,600원(10평당 28,300원 적용,
-- 발송 시점이 단가 갱신 후) — 총 1,169,600원. 라인 수정을 위해 해당 청구서만 draft로 되돌림.
-- ("3. 2606 포어텔.pdf"의 1,155,540원(21,270 기준)은 미발송 버전으로 확인됨)
UPDATE bills SET status = 'draft', paid_at = NULL, updated_at = NOW()
WHERE period = '2026-06'
  AND tenant_id IN (SELECT id FROM tenants WHERE name LIKE '%포어텔%');
