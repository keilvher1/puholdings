-- 6월분 공장동 2개사(포어텔 F101 33,000 / 리에이치 F103 20,000) 실발행 금액 반영을 위해
-- 해당 청구서만 draft로 되돌린다 (라인 수정은 draft에서만 가능 → API로 수정 후 재발행).
UPDATE bills SET status = 'draft', paid_at = NULL, updated_at = NOW()
WHERE period = '2026-06'
  AND tenant_id IN (SELECT id FROM tenants WHERE name LIKE '%포어텔%' OR name LIKE '%리에이치%');
