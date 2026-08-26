-- 모두의창업 2기 랜딩페이지 유입 팝업 (수정요청사항 0826 — 4번 항목)
-- 접수 마감(9/17 16:00 KST)까지 노출, 중복 실행 안전
INSERT INTO popups (title, content, image_url, link_url, link_label, start_at, end_at, is_active, priority)
SELECT
  '모두의창업 2기 접수중 — 되면 창업. 안돼도 스펙.',
  '중기부 모두의창업 2기, 포항·경북 멘토 기관은 (주)포항연합기술지주! 사업자등록 없이 아이디어만으로 신청하세요. 자소서 무료 첨삭(비대면·24시간 답변) 지원 중 — 9/17(목) 16:00 마감.',
  'https://modu-changup.vercel.app/poster-cohort2.jpg',
  'https://modu-changup.vercel.app',
  '자세히 보기 · 첨삭 신청하기',
  NOW(),
  '2026-09-17T16:00:00+09:00',
  TRUE,
  100
WHERE NOT EXISTS (
  SELECT 1 FROM popups WHERE link_url = 'https://modu-changup.vercel.app'
);
