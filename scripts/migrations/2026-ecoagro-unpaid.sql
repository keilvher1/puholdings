-- 에코앤아그로 미납 확정 (사용자 확인: 5·6월분 발송했으나 미납, 퇴실일 2026-04-25)
-- ① 5·6월분 청구서를 연체(미납) 상태로 전환 — 합계 490,830원
UPDATE bills SET status = 'overdue', paid_at = NULL, updated_at = NOW()
WHERE period IN ('2026-05', '2026-06')
  AND tenant_id IN (SELECT id FROM tenants WHERE name LIKE '%에코앤아그로%');

-- ② 퇴실 처리 때 자동 기록된 보증금 반환액(2,000,000)을 초기화 — 미납 상계 검토 전
--    (상계 제안: 2,000,000 − 490,830 = 1,509,170원)
UPDATE contracts SET deposit_returned_amount = NULL, deposit_returned_at = NULL, updated_at = NOW()
WHERE tenant_id IN (SELECT id FROM tenants WHERE name LIKE '%에코앤아그로%');

-- ③ 기업 상태 퇴거 처리 (앞으로 청구·발급 대상에서 완전 제외)
UPDATE tenants SET status = 'moved_out', updated_at = NOW() WHERE name LIKE '%에코앤아그로%';
