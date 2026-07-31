-- 에이치이엠파마 퇴실 확정 (사용자 확인: 현재 공실). 6월분까지 발송 확정이므로 퇴거 상태 전환.
-- ⚠ 미결: 6월 사용분 공장동 F102 전기 1,852,000원은 청구 대상 소멸로 미회수 — 처리 방안 사용자 결정 대기.
UPDATE tenants SET status = 'moved_out', updated_at = NOW() WHERE name LIKE '%에이치이엠%';
