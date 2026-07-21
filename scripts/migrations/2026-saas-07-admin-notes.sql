-- 2026-saas-07-admin-notes.sql
-- 관리자 메모·확인 사항: 시스템/이관 과정에서 남긴 안내와 확인 요청을 관리자가 보고
-- 답변을 입력하거나 해결 처리할 수 있다. 데이터 이관(엑셀) 관련 항목 4건 시드.

CREATE TABLE IF NOT EXISTS admin_notes (
  id SERIAL PRIMARY KEY,
  category VARCHAR(30) NOT NULL DEFAULT 'memo',
  title VARCHAR(300) NOT NULL,
  body TEXT,
  status VARCHAR(10) NOT NULL DEFAULT 'open',
  answer TEXT,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_notes_category_check CHECK (category IN ('migration', 'confirm', 'memo')),
  CONSTRAINT admin_notes_status_check CHECK (status IN ('open', 'resolved'))
);

INSERT INTO admin_notes (category, title, body)
SELECT 'migration',
  '구 계량기 검침 이력(2023~2025.3)은 이관하지 않음',
  '공장동 전기 시트의 2023년~2025년 3월 누적 지침은 교체 전 구 계량기의 기록입니다(구 계량기 최종값 190,767 > 현 계량기 시작값 129,243). 현재 계량기 체인(2025-11~2026-04)과 섞으면 사용량이 음수로 계산되어 제외했습니다. 해당 구간 조회가 필요하면 보관된 원본 엑셀(docs/reference)을 참고하세요.'
WHERE NOT EXISTS (SELECT 1 FROM admin_notes WHERE title LIKE '구 계량기 검침 이력%');

INSERT INTO admin_notes (category, title, body)
SELECT 'migration',
  '2·3·4월 정산 기록 없음 — 파일이 있으면 이관 가능',
  '원본 엑셀에는 1월(2501)과 5월(2605) 정산 시트만 있어 2~4월 청구 기록은 이관하지 못했습니다. 해당 월 정산 파일이 따로 있다면 이 메모의 답변란에 알려 주시거나 개발 담당자에게 전달해 주세요.'
WHERE NOT EXISTS (SELECT 1 FROM admin_notes WHERE title LIKE '2·3·4월 정산 기록%');

INSERT INTO admin_notes (category, title, body)
SELECT 'confirm',
  '쇼피안㈜ 상태 확인 — 퇴거 표시인데 409호 계약은 활성',
  '쇼피안㈜가 기업 목록에서 ''퇴거'' 상태이지만 409호 계약은 진행 중입니다(관리자 화면 테스트 흔적으로 추정). 실제로 입주 중이면 [입주기업] 메뉴에서 상태를 ''입주 중''으로 변경해 주세요. 실제 퇴거했다면 [관리비 정산 > 설정 > 계약 관리]에서 409호 계약도 퇴실 처리해야 다음 달 청구에서 제외됩니다. 확인 결과를 답변란에 남겨 주세요.'
WHERE NOT EXISTS (SELECT 1 FROM admin_notes WHERE title LIKE '쇼피안%');

INSERT INTO admin_notes (category, title, body)
SELECT 'confirm',
  '브릿지쉼상담센터 ↔ ㈜브릿지국제힐링센터 동일 기관 여부',
  '1월 정산표의 ''브릿지쉼상담센터''(퇴거 처리됨)와 5월의 ''㈜브릿지국제힐링센터''(206호, 입주 중)가 같은 기관의 개명인지 확인이 필요합니다. 같은 곳이면 두 기록을 병합할 수 있습니다 — 확인 결과를 답변란에 남겨 주세요. 별개 기관이면 현재 상태(각각 별도 기록)가 맞습니다.'
WHERE NOT EXISTS (SELECT 1 FROM admin_notes WHERE title LIKE '브릿지쉼상담센터%');
