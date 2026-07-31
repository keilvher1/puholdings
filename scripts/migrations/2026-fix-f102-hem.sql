-- F102·102호 청구 명의 정정: 실제 6월 청구서 확인 결과 F102는 윤홍섭 교수 개인이 아니라
-- 에이치이엠파마(102호+F102, 평당 20,000원 구계약) 명의로 청구되고 있음.
-- ① HEM파마 재입주 처리(+사업자번호 보완), ② 잘못 생성된 윤홍섭 명의 6~8월분 삭제
--    (6월분은 HEM 명의 1,246,270원으로 재생성, 7~8월 초안은 재생성으로 대체).
--    5월분(1,032,000, 이관분)은 발송본 미확인이라 보존.
UPDATE tenants SET status = 'active', business_no = COALESCE(business_no, '7938600692'), updated_at = NOW()
WHERE name LIKE '%에이치이엠%';
DELETE FROM bills WHERE period IN ('2026-06', '2026-07', '2026-08')
  AND tenant_id IN (SELECT id FROM tenants WHERE name LIKE '%윤홍섭%');
