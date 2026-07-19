-- 2026-saas-06-site-content.sql
-- 공개 페이지의 하드코딩 콘텐츠를 관리자에서 편집 가능하게: 키-값 싱글턴(site_content)
-- + collection별 정렬 리스트(content_items). 현재 사이트 내용을 시드해 관리자에 그대로 노출한다.

CREATE TABLE IF NOT EXISTS site_content (
  key VARCHAR(50) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_items (
  id SERIAL PRIMARY KEY,
  collection VARCHAR(50) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_items_collection ON content_items (collection, sort_order);

-- ---------- 싱글턴 텍스트 시드 ----------

INSERT INTO site_content (key, value) VALUES
  ('contact', $j${"address":"경북 포항시 북구 흥해읍 한동로 558 IT융합관 302호","phone":"054-279-8710","email":"","map_label":"한동대학교 IT융합관"}$j$::jsonb)
  ON CONFLICT (key) DO NOTHING;

INSERT INTO site_content (key, value) VALUES
  ('hero', $j${"label":"POHANG UNITED HOLDINGS","title":"기술의 가능성을\n미래의 가치로","subtitle":"POSTECH·한동대 기술사업화를 선도하는 포항연합기술지주"}$j$::jsonb)
  ON CONFLICT (key) DO NOTHING;

INSERT INTO site_content (key, value) VALUES
  ('core_functions_intro', $j${"paragraphs":["대학 기술지주회사이자 지역 액셀러레이터로서 대학 창업 활성화 및 대학 공동 사업 확대(글로컬, RISE 연계)를 통한 지산학연 창업 생태계 구축 추진","창업보육센터 운영, 벤처투자 및 창업지원 사업 등을 통해 우수 (예비)창업자 발굴, 육성, 투자 등의 업무 진행"]}$j$::jsonb)
  ON CONFLICT (key) DO NOTHING;

-- ---------- 연혁(history) ----------

INSERT INTO content_items (collection, sort_order, data)
SELECT 'history', ord, val::jsonb FROM (VALUES
  (1, $j${"year":2026,"date":"2026. 03","text":"중소벤처기업부, 모두의 창업 주관기관 선정"}$j$),
  (2, $j${"year":2026,"date":"2026. 03","text":"중소벤처기업부, 특화역량 BI(산학협력형)지원사업 주관기관 선정"}$j$),
  (3, $j${"year":2025,"date":"2025. 12","text":"한동대학교 RISE사업단 기업밀착 보육 및 사업화 지원 프로그램 운영 용역기관 선정"}$j$),
  (4, $j${"year":2025,"date":"2025. 11","text":"한동대학교 RISE사업단 경북지역 ESG 역량강화 프로그램 운영 용역기관 선정"}$j$),
  (5, $j${"year":2025,"date":"2025. 07","text":"경북문화재단, 경북 북부 청년크리에이터 성장지원사업 용역 기관 선정"}$j$),
  (6, $j${"year":2025,"date":"2025. 04","text":"중기부, 2025 특화 역량 BI 육성지원사업 주관기관 선정"}$j$),
  (7, $j${"year":2024,"date":"2024. 07","text":"영덕군, 창업 및 이전스타트업 활성화지원사업 용역기관 선정"}$j$),
  (8, $j${"year":2024,"date":"2024. 04","text":"(주)에이치디에스바이오 투자 회수(M&A)"}$j$),
  (9, $j${"year":2024,"date":"2024. 04","text":"경북문화재단, 콘텐츠기업 투자유치 프로그램 용역기관 선정"}$j$),
  (10, $j${"year":2024,"date":"2024. 04","text":"문체부, 2024년 아이디어사업화 지원사업 주관기관 선정"}$j$),
  (11, $j${"year":2024,"date":"2024. 04","text":"중기부, 2024 창업보육센터 보육역량강화사업 주관기관 선정"}$j$),
  (12, $j${"year":2023,"date":"2023. 12","text":"(주)에콤환경, (주)이롭 투자 회수"}$j$),
  (13, $j${"year":2023,"date":"2023. 05","text":"중기부, 창업기획자 등록"}$j$),
  (14, $j${"year":2023,"date":"2023. 04","text":"중기부, 2023년 지역기술창업육성 지원사업 주관기관 선정"}$j$),
  (15, $j${"year":2023,"date":"2023. 01","text":"한동대학교 창업보육센터 위탁 운영"}$j$),
  (16, $j${"year":2021,"date":"2021. 09","text":"환동해기술금융협의회 회원사 가입"}$j$),
  (17, $j${"year":2021,"date":"2021. 02","text":"(주)에콤환경, (주)오픈인, (주)이롭 연구소 기업 등록 지원"}$j$),
  (18, $j${"year":2020,"date":"2020. 12","text":"(주)에콤환경, (주)오픈인, (주)이롭 투자"}$j$),
  (19, $j${"year":2020,"date":"2020. 03","text":"(주)에이치디에스바이오 연구소기업 등록"}$j$),
  (20, $j${"year":2019,"date":"2019. 07","text":"(주)아이언박스 투자"}$j$),
  (21, $j${"year":2019,"date":"2019. 03","text":"(주)에이치디에스바이오 투자"}$j$),
  (22, $j${"year":2018,"date":"2018. 06","text":"(주)포항연합기술지주 설립"}$j$),
  (23, $j${"year":2017,"date":"2017. 12","text":"산학연협력기술지주회사 교육부 인가"}$j$)
) AS t(ord, val)
WHERE NOT EXISTS (SELECT 1 FROM content_items WHERE collection = 'history');

-- ---------- 조직 구성원(org_member) ----------

INSERT INTO content_items (collection, sort_order, data)
SELECT 'org_member', ord, val::jsonb FROM (VALUES
  (1, $j${"team":"management","name":"심규진","position":"부대표","role":"투자, 펀드 조성, 경영 관리","details":["한동대학교 대학원 AI융합학과 교수 (창업 전공 담당)","공공 펀드 650억 규모 조성 참여, Startup exits 2회","전국 최대 규모 문화기획사 창업, 와디즈 인사 총괄"]}$j$),
  (2, $j${"team":"management","name":"안석현","position":"이사","role":"운영 총괄","details":["VC 전문인력, 창업보육전문매니저","포항공과대학교 기술지주(주) 액셀러레이팅팀 팀장","2023년 중소벤처기업부 창업보육 장관상 수상"]}$j$),
  (3, $j${"team":"strategy","name":"이강원","position":"실장","role":"사업 기획 총괄","details":["VC 전문인력, 창업보육전문매니저","동국대학교 창업보육센터 매니저"]}$j$),
  (4, $j${"team":"investment","name":"김병규","position":"팀장","role":"투자 / 외부사업","details":["창업보육전문매니저","웰컴저축은행, 푸드팡(스타트업) 팀장 등"]}$j$),
  (5, $j${"team":"investment","name":"박진기","position":"주임","role":"투자 / 외부사업","details":["창업보육전문매니저, 벤처투자분석사","조슈아파트너스(AC), 아트와(스타트업) 이사 등"]}$j$),
  (6, $j${"team":"incubation","name":"김예준","position":"팀장","role":"창업 보육 / 교내 사업","details":["창업보육전문매니저","한동대학교 직원, 블라썸(스타트업) 대표"]}$j$),
  (7, $j${"team":"incubation","name":"허홍석","position":"주임","role":"창업 보육 / 교내 사업","details":["창업보육전문매니저"]}$j$),
  (8, $j${"team":"venture","name":"이원중 (David)","position":"벤처파트너","role":"F&B 인큐베이팅 / 투자","details":["UC San Diego 경제학과 졸업","두더지프로젝트 대표 CEO (F&B 인큐베이팅 전문기업)","창리단길 로컬스페이스 10개소 설립 운영","AI 언어학습 원아원, 웰니스 달램 VC 투자","LINC 3.0 산학연계 교육협력기관 (한동대 외 4개교)"]}$j$)
) AS t(ord, val)
WHERE NOT EXISTS (SELECT 1 FROM content_items WHERE collection = 'org_member');

-- ---------- 유관기관(partner_org) ----------

INSERT INTO content_items (collection, sort_order, data)
SELECT 'partner_org', ord, val::jsonb FROM (VALUES
  (1, $j${"name":"경북창조경제혁신센터","logo_url":"https://hebbkx1anhila5yf.public.blob.vercel-storage.com/%E1%84%80%E1%85%A7%E1%86%BC%E1%84%87%E1%85%AE%E1%86%A8%E1%84%8E%E1%85%A1%E1%86%BC%E1%84%8C%E1%85%A9%E1%84%80%E1%85%A7%E1%86%BC%E1%84%8C%E1%85%A6%E1%84%92%E1%85%A7%E1%86%A8%E1%84%89%E1%85%B5%E1%86%AB%E1%84%89%E1%85%A6%E1%86%AB%E1%84%90%E1%85%A5-%E1%84%85%E1%85%A9%E1%84%80%E1%85%A9-removebg-preview-c5UlGcMZeVUCalaI4H7FdA9gyONTdB.png","description":"경북 지역의 혁신창업 앵커로서 창업기업 발굴부터 육성, 성장까지 지원하고 있으며, 특히 다양한 엑셀러레이팅 프로그램을 운영 중으로 본 사업 참여기업 공동 발굴 및 후속 연계 지원 등이 가능함."}$j$),
  (2, $j${"name":"(재)포항테크노파크","logo_url":"https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-6qEQAHXMCjqamXrFWMZQsB3cucVt8U.png","description":"지역의 유망기업을 발굴·육성하는 지역산업 거점기관으로 창업보육, 연구개발, 시험생산 등 기업지원 서비스와 지역 맞춤형 산업 발전 전략 및 정책을 수립하며 기술집약 기업의 창업과 성장을 지원하고 있음."}$j$),
  (3, $j${"name":"경북콘텐츠기업지원센터","logo_url":"https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-wSZUHEhnkFolquwX83rMiWaBwBH2dA.png","description":"경상북도 콘텐츠기업지원센터는 지역 ICT 융복합 콘텐츠를 기반으로 지원 생태계 허브 구축을 통해 지역 경제 혁신 성장 및 콘텐츠 기업 진흥을 위한 원스톱 지원센터로, 참여기업 공동 발굴 및 후속 연계 지원 등이 가능함."}$j$),
  (4, $j${"name":"KOSME 청년창업사관학교","logo_url":"https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-Vs2uo5OdOCBWUzd6dcjmrteiRAVTJ7.png","description":"경북청년창업사관학교는 유망 창업아이템 및 혁신기술을 보유한 우수 창업자를 발굴하여 성공적인 창업사업화 지원을 위한 프로그램 운영하고 있으며, 참여기업 공동 발굴 등 다방면에서 협력이 가능할 것으로 예상함."}$j$),
  (5, $j${"name":"(주)대경지역대학공동기술지주","logo_url":"https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-XgwGBVPdempHBZXSbs30XEeOXrtH2U.png","description":"대구·경북 소재 11개 대학과 대구TP 및 경북TP가 공동 출자로 설립한 기술사업화 및 스타트업 투자전문기관으로, 본 사업의 참여기업에 대한 투자 및 TIPS 추천 등이 가능한 협력 투자사임."}$j$),
  (6, $j${"name":"Y&ARCHER","logo_url":"https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-w2ArVNJW80Zrb0KGE5dDPNgIPzfMYu.png","description":"콘텐츠·콘텐츠융합·스포츠·스포츠융합 분야 등의 초기스타트업을 대상으로 하는 전문 액셀러레이터로 유망한 초기스타트업을 발굴 및 육성하고 발굴된 기업에 체계적인 밀착 지원과 글로벌 진출 및 연계를 지원하고자 함."}$j$)
) AS t(ord, val)
WHERE NOT EXISTS (SELECT 1 FROM content_items WHERE collection = 'partner_org');

-- ---------- 운영도 활동(core_activity) ----------

INSERT INTO content_items (collection, sort_order, data)
SELECT 'core_activity', ord, val::jsonb FROM (VALUES
  (1, $j${"group":"handong","text":"창업 교육"}$j$),
  (2, $j${"group":"handong","text":"창업 동아리"}$j$),
  (3, $j${"group":"handong","text":"특허 관리 및 기술이전"}$j$),
  (4, $j${"group":"handong","text":"창업경진대회"}$j$),
  (5, $j${"group":"puholdings","text":"창업보육센터 운영"}$j$),
  (6, $j${"group":"puholdings","text":"벤처투자"}$j$),
  (7, $j${"group":"puholdings","text":"액셀러레이팅 프로그램 운영"}$j$),
  (8, $j${"group":"puholdings","text":"TIPS/LIPS 추천"}$j$),
  (9, $j${"group":"external","text":"오픈 이노베이션"}$j$),
  (10, $j${"group":"external","text":"VC, PE, IB 투자"}$j$),
  (11, $j${"group":"external","text":"판로 개척"}$j$),
  (12, $j${"group":"external","text":"해외 진출"}$j$)
) AS t(ord, val)
WHERE NOT EXISTS (SELECT 1 FROM content_items WHERE collection = 'core_activity');
