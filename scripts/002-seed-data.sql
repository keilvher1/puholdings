-- Seed statistics data
INSERT INTO statistics (label, value, suffix, sort_order) VALUES
  ('입주 기업', 26, '개사', 1),
  ('누적 매출액', 141, '억원', 2),
  ('고용 인원', 188, '명', 3),
  ('투자 유치', 90, '억원', 4),
  ('지식재산권/인증', 22, '건', 5)
ON CONFLICT DO NOTHING;

-- Seed portfolio companies data
INSERT INTO portfolio_companies (name, name_en, category, description, investment_year, sort_order, status, website) VALUES
  ('(주)아이언박스', 'IRONBOX', 'AI/로봇', '지능형 산업 로봇 및 감시 솔루션', 2019, 1, 'active', NULL),
  ('(주)에이치디에스바이오', 'HDS Bio', '바이오/헬스케어', '마이크로바이옴 기반 신약 개발', 2019, 2, 'active', NULL),
  ('(주)이롭로보틱스', 'IROP Robotics', 'AI/로봇', 'AI 기반 화재 감시 솔루션', 2020, 3, 'active', 'www.irop.co.kr'),
  ('(주)오픈인', 'OpenIn', 'AI/로봇', 'ML 기반 지능형 CCTV 솔루션', 2020, 4, 'active', 'www.openin.co.kr'),
  ('(주)에콤환경', 'ECOM Environment', '에너지/환경', '열회수 환기 장치', 2020, 5, 'active', NULL),
  ('(주)다솜엑스', 'Dasom X', 'AI/IT', 'AI Agentic workflow 기반 플랫폼 개발', 2025, 6, 'active', NULL)
ON CONFLICT DO NOTHING;

-- Seed news data
INSERT INTO news (title, summary, category, published_at, is_visible) VALUES
  ('다솜엑스, AI Agentic workflow 플랫폼 신규 투자', '포항연합기술지주가 AI Agentic workflow 기반 플랫폼을 개발하는 다솜엑스에 신규 투자를 진행했다.', '투자', '2025-11-01', true),
  ('창업보육센터 경영평가 93점 달성, 전국 상위 10%', '2024년 중소벤처기업부 창업보육센터 경영평가에서 93점을 기록하며 전국 239개 센터 중 상위 10%에 진입했다.', '수상', '2024-12-15', true),
  ('입주기업 투자유치 누적 90억원 돌파', '2025년 3분기 기준 창업보육센터 입주기업들의 누적 투자유치 금액이 90억원을 돌파했다.', '실적', '2024-09-30', true),
  ('글로컬대학30·RISE 연계 창업생태계 구축 추진', '대학 창업 활성화 및 대학 공동사업 확대를 통한 지산학연 창업생태계 구축을 본격 추진한다.', '사업', '2024-08-20', true),
  ('투자조합 결성, 교원·학생·동문 기업 투자 확대', '향후 투자조합 결성을 통해 POSTECH 교원, 학생, 동문 기업 중심으로 투자를 확대할 예정이다.', '펀드', '2024-07-15', true),
  ('포항연합기술지주 자회사 3건 EXIT 완료', '고유계정으로 투자한 자회사 중 3건의 투자 회수를 성공적으로 완료했다.', 'EXIT', '2024-06-01', true)
ON CONFLICT DO NOTHING;
