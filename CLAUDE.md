# CLAUDE.md

포항연합기술지주 홈페이지 (Next.js App Router + Neon Postgres + Vercel Blob + 자체 JWT 인증).
입주기업 대상 SaaS 기능을 단계적으로 추가하는 중이다.

## 개발 컨벤션

### 1. DB 접근
- DB 접근은 `lib/db.ts`의 `getDb()`가 반환하는 neon tagged template(raw SQL)만 사용한다.
- ORM(Prisma, Drizzle 등)을 도입하지 않는다.

### 2. 마이그레이션
- `scripts/migrations/`에 `YYYY-설명.sql` 형태로 추가하고, `scripts/run-migration.mjs`로 실행한다.
- `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`로 멱등하게 작성한다.

### 3. UI
- `components/ui`의 shadcn/ui 컴포넌트를 사용한다.
- 새 UI 라이브러리를 추가하지 않는다.

### 4. 파일 저장
- Vercel Blob(`access: private`) + `/api/file` 프록시 패턴을 따른다.
- 첨부 메타데이터는 JSONB 배열 구조를 쓴다:
  `[{ name, pathname, size, type, preview_pathname?, preview_status? }]`

### 5. 인증
- 관리자: `admin_token` 쿠키 + `getSession()`.
- 입주기업 포털: `portal_token` 쿠키 + `getPortalSession()`.
- 모든 `/api/admin/*`은 `getSession()`, `/api/portal/*`은 `getPortalSession()`을 반드시 검증한다.
- portal API는 요청 파라미터가 아닌 **세션의 `tenant_id`로만** 데이터를 스코프한다.

### 6. 메일 발송
- `lib/mail.ts`의 `sendMail()` / `sendBatch()` 단일 진입점만 사용한다.
- 직접 Resend API를 호출하는 코드를 흩뿌리지 않는다.
- 실패해도 throw하지 않고 `{ success: false }`를 반환하며, 모든 시도는 `email_logs`에 기록된다.
- 필요 env: `RESEND_API_KEY`, `MAIL_FROM`, (문의 알림용) `ADMIN_NOTIFY_EMAIL`. 미설정 시 발송은 스킵되고 failed 로그만 남는다.

### 7. 데이터 표기
- 금액은 원 단위 정수 `NUMERIC(12,0)`.
- 월 표기는 `'YYYY-MM'` `CHAR(7)`로 통일한다.

### 8. 언어
- 관리자 화면 텍스트는 모두 한국어.
