import { redirect } from "next/navigation"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { getAdminTodo, getCloseProgress, type AdminTodo, type CloseProgress } from "@/lib/admin-todo"
import { getSupportContact } from "@/lib/runtime-flags"
import { billMonthShort, dateShort, dateTime, todayKST, usageToBill } from "@/lib/format"
import { billingCloseHref, billsHref, expensesHref, inquiriesHref, programsHref, roomsHref } from "@/lib/links"
import { HOME_HELP } from "@/lib/help/home"
import { Button } from "@/components/ui/button"
import { Callout, PageHeader, Section, StatCard, Stepper, TodoList } from "@/components/saas"
import { AdminNotesCard } from "@/components/admin/admin-notes"
import { BlockError } from "@/components/admin/dashboard/block-error"
import { buildHomeTodo, CLOSE_STEP_LABELS, closeSummary } from "@/components/admin/dashboard/home-todo"

// 관리자 홈 = "오늘 할 일"(계획서 3.2·4.1.3). 블록 4개: 오늘 할 일 / 관리비 마감 한 줄 / 운영 현황 + 메모 / 홈페이지 현황(접힘).
// 블록마다 따로 불러오고, 실패한 블록만 "불러오지 못했어요 [다시 시도]"를 보인다(실패를 0으로 바꾸지 않는다).

export const metadata = { title: "홈" }

type Result<T> = { ok: true; data: T } | { ok: false }

async function attempt<T>(fn: () => Promise<T>, label: string): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (error) {
    console.error(`[admin home] ${label} 집계 실패:`, error)
    return { ok: false }
  }
}

type Sql = NonNullable<ReturnType<typeof getDb>>

interface OpsData {
  rooms: { total: number; occupied: number; vacant: number }
  collection: { period: string; issued: number; paid: number } | null
}

async function loadOps(sql: Sql): Promise<OpsData> {
  const [rooms, collection] = (await sql.transaction(
    [
      sql`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE c.id IS NOT NULL)::int AS occupied,
               COUNT(*) FILTER (WHERE c.id IS NULL AND r.status = 'available')::int AS vacant
        FROM rooms r
        LEFT JOIN LATERAL (SELECT id FROM contracts WHERE room_id = r.id AND status = 'active' LIMIT 1) c ON TRUE
        WHERE r.is_active = TRUE
      `,
      sql`
        SELECT period,
               COUNT(*) FILTER (WHERE status IN ('issued', 'overdue', 'paid'))::int AS issued,
               COUNT(*) FILTER (WHERE status = 'paid')::int AS paid
        FROM bills
        WHERE NOT is_manual
        GROUP BY period
        HAVING COUNT(*) FILTER (WHERE status IN ('issued', 'overdue', 'paid')) > 0
        ORDER BY period DESC
        LIMIT 1
      `,
    ],
    { readOnly: true },
  )) as Record<string, unknown>[][]
  const r = rooms[0] ?? {}
  const c = collection[0]
  return {
    rooms: { total: Number(r.total) || 0, occupied: Number(r.occupied) || 0, vacant: Number(r.vacant) || 0 },
    collection: c ? { period: String(c.period).trim(), issued: Number(c.issued) || 0, paid: Number(c.paid) || 0 } : null,
  }
}

interface SiteData {
  news: number
  portfolio: number
  openPrograms: number
  inquiries30d: number
}

async function loadSite(sql: Sql): Promise<SiteData> {
  const rows = (await sql`
    SELECT
      (SELECT COUNT(*)::int FROM news) AS news,
      (SELECT COUNT(*)::int FROM portfolio_companies) AS portfolio,
      (SELECT COUNT(*)::int FROM programs WHERE status = 'open') AS open_programs,
      (SELECT COUNT(*)::int FROM inquiries WHERE created_at >= NOW() - INTERVAL '30 days') AS inquiries_30d
  `) as Record<string, unknown>[]
  const r = rows[0] ?? {}
  return {
    news: Number(r.news) || 0,
    portfolio: Number(r.portfolio) || 0,
    openPrograms: Number(r.open_programs) || 0,
    inquiries30d: Number(r.inquiries_30d) || 0,
  }
}

export default async function AdminHomePage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  const sql = getDb()
  const today = todayKST()
  const fail = { ok: false } as const
  const [todoR, closeR, opsR, siteR] = sql
    ? await Promise.all([
        attempt<AdminTodo>(() => getAdminTodo(sql), "할 일"),
        attempt<CloseProgress>(() => getCloseProgress(sql), "월 마감"),
        attempt<OpsData>(() => loadOps(sql), "운영 현황"),
        attempt<SiteData>(() => loadSite(sql), "홈페이지 현황"),
      ])
    : [fail, fail, fail, fail]

  const home = todoR.ok ? buildHomeTodo(todoR.data) : null
  const close = closeR.ok ? closeR.data : null
  const closeInfo = close ? closeSummary(close) : null

  const description = home ? `${dateShort(today, today)} · 오늘 할 일 ${home.items.length}건` : dateShort(today, today)

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="홈"
        description={description}
        help={HOME_HELP}
        helpContact={getSupportContact()}
        secondary={
          <Button asChild variant="outline" className="hover:bg-warm-beige hover:text-dark">
            <Link href={expensesHref()}>증빙 올리기</Link>
          </Button>
        }
        primary={
          <Button asChild>
            <Link href={closeInfo?.continueHref ?? billingCloseHref()}>관리비 마감 이어 하기</Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-6">
        {/* 휴대폰에서는 할 일 목록이 먼저(첫 화면에 4줄 이상), 넓은 화면에서는 안내가 먼저 */}
        <section aria-labelledby="home-todo-title" className="order-1 lg:order-2">
          <h2 id="home-todo-title" className="mb-2 text-lg font-semibold text-dark">
            오늘 할 일{home ? ` ${home.items.length}건` : ""}
          </h2>
          {home ? (
            <>
              <TodoList
                state="ready"
                items={home.items}
                emptyDetail={`마지막 확인 ${dateTime(new Date(), today)}`}
              />
              {home.mailOffNote && (
                <p className="mt-2 text-sm leading-relaxed text-text-secondary [word-break:keep-all]">{home.mailOffNote}</p>
              )}
            </>
          ) : (
            <BlockError title="할 일 건수를 불러오지 못했어요" />
          )}
        </section>

        <Callout
          storageKey="admin-home-whats-new-2026-10"
          title="이번에 바뀐 것 5가지"
          className="order-2 lg:order-1"
        >
          <ul className="list-disc space-y-0.5 pl-5">
            <li>메뉴 이름이 바뀌었어요: 대시보드 → 홈, 사업비 정산 → 증빙 처리, 관리비 설정 → 기준 정보</li>
            <li>퇴실은 호실 현황에서 처리해요</li>
            <li>청구서 첫 화면은 받을 돈이에요</li>
            <li>납부 처리는 여러 건을 한 번에 할 수 있고 되돌릴 수 있어요</li>
            <li>화면마다 오른쪽 위 [도움말]이 있어요</li>
          </ul>
        </Callout>

        {/* 관리비 마감 한 줄 */}
        <Section
          className="order-3"
          title={close ? `관리비 마감 · ${usageToBill(close.usageMonth)}` : "관리비 마감"}
          actions={
            closeInfo ? (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[15px] font-medium text-dark">{closeInfo.doneText}</span>
                <Link
                  href={closeInfo.continueHref}
                  className="inline-flex min-h-8 items-center gap-0.5 text-[15px] font-medium text-link underline underline-offset-2 hover:text-dark"
                >
                  {closeInfo.continueLabel}
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              </span>
            ) : undefined
          }
        >
          {close ? (
            <>
              {/* 휴대폰: Stepper 축약("4단계 중 4단계 · 발행")이 머리의 "4단계 중 3단계 완료"와 다른 숫자로 읽혀 다음 단계 한 줄로 대신한다 */}
              <p className="text-[15px] text-dark sm:hidden [word-break:keep-all]">
                {close.nextStep
                  ? `다음 단계: ${close.nextStep}. ${CLOSE_STEP_LABELS[close.nextStep - 1]}`
                  : "이번 달 마감 단계를 모두 마쳤어요"}
                {close.nextStep && close.steps[close.nextStep - 1]?.note ? (
                  <span className="block text-sm text-text-secondary">{close.steps[close.nextStep - 1].note}</span>
                ) : null}
              </p>
              <div className="hidden sm:block">
                <Stepper
                  className="mb-0"
                  label="관리비 마감 단계"
                  steps={close.steps.map((s, i) => ({ key: s.key, label: CLOSE_STEP_LABELS[i], status: s.status, note: s.note }))}
                  hrefs={Object.fromEntries(close.steps.map((s, i) => [s.key, billingCloseHref(close.usageMonth, (i + 1) as 1 | 2 | 3 | 4)]))}
                />
              </div>
            </>
          ) : (
            <BlockError title="월 마감 진행 상태를 불러오지 못했어요" />
          )}
        </Section>

        {/* 운영 현황 + 메모 */}
        <div className="order-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Section title="운영 현황">
            {opsR.ok ? <Ops data={opsR.data} today={today} /> : <BlockError title="운영 현황을 불러오지 못했어요" />}
          </Section>
          <AdminNotesCard />
        </div>

        {/* 홈페이지 현황(기본 접힘) */}
        <details className="group order-5 rounded-md border border-warm-tan bg-card">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 text-base font-semibold text-dark sm:px-5 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
            홈페이지 현황
            {siteR.ok && (
              <span className="ml-1 hidden truncate text-sm font-normal text-text-secondary sm:inline">
                소식 {siteR.data.news} · 포트폴리오 {siteR.data.portfolio} · 모집 중 프로그램 {siteR.data.openPrograms}
              </span>
            )}
          </summary>
          <div className="border-t border-warm-tan px-4 py-4 sm:px-5">
            {siteR.ok ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="최신 소식" value={siteR.data.news} unit="건" href="/admin/news" />
                  <StatCard label="포트폴리오" value={siteR.data.portfolio} unit="곳" href="/admin/portfolio" />
                  <StatCard label="모집 중 프로그램" value={siteR.data.openPrograms} unit="개" href={programsHref()} />
                  <StatCard label="최근 30일 문의" value={siteR.data.inquiries30d} unit="건" href={inquiriesHref()} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm" className="hover:bg-warm-beige hover:text-dark">
                    <Link href="/admin/news/new">소식 쓰기</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="hover:bg-warm-beige hover:text-dark">
                    <Link href="/admin/site">사이트 콘텐츠 편집</Link>
                  </Button>
                </div>
              </>
            ) : (
              <BlockError title="홈페이지 현황을 불러오지 못했어요" />
            )}
          </div>
        </details>
      </div>
    </div>
  )
}

function Ops({ data, today }: { data: OpsData; today: string }) {
  const { total, occupied, vacant } = data.rooms
  if (total === 0) {
    return (
      <p className="text-base text-text-secondary">
        아직 등록한 호실이 없어요.{" "}
        <Link href="/admin/billing/settings?tab=rooms" className="text-link underline underline-offset-2">
          기준 정보에서 호실 등록하기
        </Link>
      </p>
    )
  }
  const rate = Math.round((occupied / total) * 100)
  const c = data.collection
  return (
    <div className="grid gap-4">
      <div>
        <p className="flex flex-wrap items-baseline gap-x-2 text-dark">
          <span className="text-sm font-medium text-[#3f3f4e]">입주율</span>
          <span className="text-2xl font-bold tabular-nums">{rate}%</span>
          <span className="text-sm text-text-secondary">
            {total}실 중 {occupied}실 입주 중
          </span>
        </p>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-warm-beige"
          role="img"
          aria-label={`입주율 ${rate}%`}
        >
          <div className="h-full bg-dark" style={{ width: `${rate}%` }} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="공실" value={vacant} unit="실" href={roomsHref({ state: "vacant" })} />
        {c ? (
          <StatCard
            label={`${billMonthShort(c.period, today)} 수납`}
            value={`${c.issued}건 중 ${c.paid}건`}
            href={billsHref({ view: "month", period: c.period })}
          />
        ) : (
          <StatCard label="수납" value="발행 전" hint="발행한 청구서가 아직 없어요" />
        )}
      </div>
    </div>
  )
}
