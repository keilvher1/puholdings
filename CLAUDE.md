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
- 여러 파일을 한 번에 내려줄 때는 `fflate`의 `zip()`을 쓴다(한글 파일명용 UTF-8 플래그가 붙는다).
  다른 압축 라이브러리를 추가하지 않는다. 예: `/api/admin/billing/bills/download`.

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

### 9. AI 사진 판독 (OpenAI)
- 계량기·한전 고지서 사진 판독은 `lib/meter-scan.ts`의 `scanMeterImages()` 단일 진입점만 사용한다.
- OpenAI Responses API + strict JSON Schema를 쓴다. 프로젝트가 zod v3이라 SDK의 zod 헬퍼(`zodTextFormat`)는 쓰지 않는다.
- 모델 기본값 `gpt-5.6-sol`, `OPENAI_MODEL`로 덮어쓸 수 있다(terra·luna로 낮추면 비용이 준다).
- `OPENAI_API_KEY` 미설정 시 판독 API는 503 + `needs_setup: true`를 반환하고, 화면은 직접 입력으로 계속 동작해야 한다.
- 판독 결과는 **제안**이다. 어떤 경로로도 사용자 확인 없이 DB에 저장하지 않는다.

### 10. 사내 메신저 (잔디 벤치마킹, 자체 구현)
- 공용 타입·상수는 `lib/messenger-types.ts`, 서버 로직은 `lib/messenger.ts`, 세션 → 구성원 변환은 `lib/messenger-auth.ts`의 `getMessengerMember()` 하나만 쓴다.
  관리자 세션 = 정회원(member), 포털 세션 = 게스트(guest). 외부 메신저 API를 연동하지 않는다.
- **데이터 범위는 방 참여(`messenger_room_members`)로만 정한다.** 모든 `/api/messenger/*`는 맨 앞에서 `getMessengerMember()`(없으면 401),
  방·메시지·첨부를 건드리는 요청은 참여 여부를 확인하고 아니면 404. 요청 파라미터(room_id 등)만 믿고 조회하지 않는다.
  첨부(`messenger/{room_id}/…`)도 `/api/file`에서 같은 규칙으로 막는다. 게스트는 공개 토픽 둘러보기·토픽 생성·초대·웹훅 관리 불가.
- 모든 쓰기는 `messenger_events`에 이벤트를 남긴다(클라이언트는 `/api/messenger/sync` 폴링으로만 갱신).
- **업무 알림은 `postSystemMessage()` 단일 진입점**으로 "시스템 알림" 토픽(system_slug 'alerts')에 남긴다.
  라우트에서는 `lib/messenger-notify.ts`의 `notify*()` 한 줄만 부른다(`after()`로 응답 후 실행, 실패해도 본 작업은 성공).
  현재 연결: 공개 문의 접수, 데스크톱 앱 증빙 도착(3분 안 연속 도착은 대기 건수 요약), 관리비 청구서 발행.
- 웹훅 수신(`/api/messenger/hooks/{token}`)만 세션 없이 토큰으로 인증한다(상수 시간 비교, 분당 60건, 본문 5000자).
