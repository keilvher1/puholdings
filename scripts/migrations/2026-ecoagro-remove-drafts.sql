-- 에코앤아그로 퇴실(2026-04-25) 반영: 퇴실 후 회차의 미발행 초안(7·8월) 제거.
-- generate는 청구 대상에서 빠진 기업의 기존 draft를 삭제하지 않으므로 명시 삭제.
-- (5·6월분 paid 이력은 실발송/납부 여부 확인 전까지 보존)
DELETE FROM bills
WHERE period IN ('2026-07', '2026-08') AND status = 'draft'
  AND tenant_id IN (SELECT id FROM tenants WHERE name LIKE '%에코앤아그로%');
