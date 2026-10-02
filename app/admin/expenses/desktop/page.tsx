import Link from "next/link"
import { redirect } from "next/navigation"
import { Download } from "lucide-react"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { getAdminTodo } from "@/lib/admin-todo"
import { expensesHref } from "@/lib/links"
import { getSupportContact } from "@/lib/runtime-flags"
import { EXPENSES_DESKTOP_HELP } from "@/lib/help/expenses-upload"
import { Button } from "@/components/ui/button"
import { EmptyState, Notice, PageHeader, Section } from "@/components/saas"
import { ExpensesNav } from "@/components/admin/expenses/expenses-nav"
import { DESKTOP_PLATFORMS, DESKTOP_PLATFORM_INFO, formatFileSize, listDesktopReleases } from "@/lib/desktop-release"

// 데스크톱 앱(포연기 증빙함) 설치 안내(계획서 4.2.5).
// 설치 파일은 비공개 Blob desktop/{버전}/…에 있고, 플랫폼별 최신 버전을 찾아
// 관리자 전용 다운로드 라우트(/api/admin/expenses/desktop/download)로 연결한다.
// 앱에 넣은 파일은 이 화면이 아니라 '증빙 올리기' 탭에 모인다(대기 건수와 바로가기를 보여 준다).

export const dynamic = "force-dynamic"

type DownloadLink = { label: string; note: string; url: string }

async function downloads(): Promise<{ ok: true; files: DownloadLink[] } | { ok: false }> {
  try {
    const releases = await listDesktopReleases()
    return {
      ok: true,
      files: DESKTOP_PLATFORMS.flatMap((platform) => {
        const r = releases[platform]
        if (!r) return []
        const info = DESKTOP_PLATFORM_INFO[platform]
        return [
          {
            label: info.label,
            note: `${info.note} · ${formatFileSize(r.size)} · 버전 ${r.version}`,
            url: `/api/admin/expenses/desktop/download?platform=${platform}`,
          },
        ]
      }),
    }
  } catch (error) {
    console.error("[desktop-page] 설치 파일 목록 조회 실패:", error)
    return { ok: false }
  }
}

// 지금 데스크톱 앱에서 와서 확인을 기다리는 증빙 수(레이아웃이 이미 읽은 값 — 같은 요청에서 다시 조회하지 않는다). 실패하면 숨긴다.
async function pendingCount(): Promise<number | null> {
  try {
    const sql = getDb()
    if (!sql) return null
    return (await getAdminTodo(sql)).expenseInbox.count
  } catch {
    return null
  }
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-base text-dark marker:text-text-secondary [word-break:keep-all]">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ol>
  )
}

export default async function AdminExpensesDesktopPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")
  const [result, pending] = await Promise.all([downloads(), pendingCount()])

  return (
    <div className="p-5 md:p-8">
      <PageHeader
        title="데스크톱 앱 설치"
        breadcrumbs={[{ label: "증빙 처리", href: "/admin/expenses" }, { label: "데스크톱 앱 설치" }]}
        description="포연기 증빙함 앱을 컴퓨터에 설치해요"
        help={EXPENSES_DESKTOP_HELP}
        helpContact={getSupportContact()}
        className="mb-4"
      />
      <ExpensesNav inboxCount={pending} />

      <div className="max-w-3xl space-y-5">
        <Notice
          tone="info"
          action={
            pending && pending > 0 ? (
              <Button asChild size="sm">
                <Link href={expensesHref({ inbox: true })}>지금 {pending}건 확인하기</Link>
              </Button>
            ) : undefined
          }
        >
          앱에 넣은 파일은 ‘증빙 올리기’ 탭에 모여요.
          {pending !== null && (pending > 0 ? ` 지금 ${pending}건이 확인을 기다려요.` : " 지금 확인을 기다리는 증빙은 없어요.")}
        </Notice>

        <Section
          title="포연기 증빙함 설치"
          description="화면 가장자리의 둥근 버튼에 증빙 파일을 끌어다 놓으면 서버에 보관되고 자동 인식돼요."
          headingLevel={2}
        >
          {!result.ok ? (
            <EmptyState
              kind="error"
              compact
              bordered
              title="설치 파일 목록을 불러오지 못했어요"
              description="잠시 뒤 다시 시도해 주세요."
              retryHref="/admin/expenses/desktop"
            />
          ) : result.files.length === 0 ? (
            <EmptyState kind="first-use" compact bordered title="아직 올린 설치 파일이 없어요" description="설치 파일이 준비되면 여기에 보여요." />
          ) : (
            <div className="flex flex-wrap gap-2">
              {result.files.map((f) => (
                <Button key={f.label} asChild variant="outline" className="h-auto py-2 hover:bg-warm-beige">
                  <a href={f.url} download>
                    <Download className="h-4 w-4" aria-hidden />
                    <span className="text-left">
                      <span className="block text-[15px] font-semibold text-dark">{f.label}</span>
                      <span className="block text-sm font-normal text-text-secondary">{f.note}</span>
                    </span>
                  </a>
                </Button>
              ))}
            </div>
          )}
          <p className="mt-3 text-sm text-text-secondary [word-break:keep-all]">
            맥 칩 확인: 왼쪽 위 Apple 메뉴 › 이 Mac에 관하여에서 칩(Apple M…)이면 Apple 칩, 프로세서(Intel…)면 Intel이에요.
          </p>
        </Section>

        <div className="grid gap-5 md:grid-cols-2">
          <Section title="맥 설치" headingLevel={3}>
            <Steps
              items={["dmg 파일을 열어요", "포연기 증빙함 아이콘을 응용 프로그램 폴더로 끌어요", "응용 프로그램 폴더에서 실행해요(Apple 공증을 마쳐 따로 허용할 필요가 없어요)"]}
            />
          </Section>
          <Section title="윈도우 설치" headingLevel={3}>
            <Steps
              items={[
                "exe 파일을 실행하고 설치 마법사에서 [다음] › [설치]를 눌러요(관리자 권한 없어도 돼요)",
                <>
                  ‘Windows의 PC 보호’가 뜨면 <b className="font-semibold">추가 정보 › 실행</b>을 눌러요
                </>,
                "바탕화면이나 시작 메뉴의 포연기 증빙함으로 실행해요",
              ]}
            />
          </Section>
        </div>

        <Section title="사용법" description="로그인은 이 관리자 화면과 같은 계정이에요." headingLevel={3}>
          <Steps
            items={[
              "영수증·카드전표·세금계산서 파일(JPG·PNG·HEIC·PDF)을 둥근 버튼에 끌어다 놓아요. 여러 개를 한 번에 놓아도 돼요",
              "버튼을 누르면 최근에 올린 파일과 확인을 기다리는 건수가 보여요. 기본 프로젝트를 고르면 표에 미리 골라져요",
              <>
                <Link href={expensesHref({ inbox: true })} className="font-medium text-link underline underline-offset-2">
                  증빙 올리기
                </Link>{" "}
                탭에서 내용을 확인하고 프로젝트를 골라 저장해요(저장하기 전에는 증빙 내역에 기록되지 않아요)
              </>,
            ]}
          />
        </Section>
      </div>
    </div>
  )
}
