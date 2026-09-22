-- admins 테이블. 이전에는 /admin 레이아웃이 렌더될 때마다 CREATE TABLE IF NOT EXISTS를
-- 실행하고 있었다(관리자 페이지 이동 한 번당 DB 왕복 1회). 여기로 옮기고 레이아웃에서 제거한다.
-- 최초 설치 부트스트랩 경로(/api/admin/setup)는 여전히 initAdminTable()을 호출하므로
-- 이 마이그레이션을 돌리지 않은 새 환경도 동작한다.
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);
