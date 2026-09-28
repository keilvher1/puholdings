import { redirect } from "next/navigation"
import { Download } from "lucide-react"
import { getSession } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { AdminPageHeader } from "@/components/admin/admin-ui"
import { ExpensesNav } from "@/components/admin/expenses/expenses-nav"
import { InlineNotice, Panel, PanelHeader } from "@/components/admin/expenses/ui"
import { DESKTOP_PLATFORMS, DESKTOP_PLATFORM_INFO, formatFileSize, listDesktopReleases } from "@/lib/desktop-release"

// 데스크톱 앱(포연기 증빙함) 설치 안내.
// 설치 파일은 비공개 Blob desktop/{버전}/…에 있고, 플랫폼별 최신 버전을 찾아
// 관리자 전용 다운로드 라우트(/api/admin/expenses/desktop/download)로 연결한다.

export const dynamic = "force-dynamic"

type DownloadLink = { label: string; note: string; url: string }

async function downloads(): Promise<DownloadLink[]> {
  try {
    const releases = await listDesktopReleases()
    return DESKTOP_PLATFORMS.flatMap((platform) => {
      const r = releases[platform]
      if (!r) return []
      const info = DESKTOP_PLATFORM_INFO[platform]
      return [{
        label: info.label,
        note: `${info.note} · ${formatFileSize(r.size)} · v${r.version}`,
        url: `/api/admin/expenses/desktop/download?platform=${platform}`,
      }]
    })
  } catch (error) {
    console.error("[desktop-page] 설치 파일 목록 조회 실패:", error)
    return []
  }
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm text-dark marker:text-text-secondary [word-break:keep-all]">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ol>
  )
}

export default async function AdminExpensesDesktopPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")
  const files = await downloads()

  return (
    <div className="p-5 md:p-8">
      <AdminPageHeader title="사업비 정산" />
      <ExpensesNav />

      <div className="max-w-3xl space-y-4">
        <Panel>
          <PanelHeader
            title="포연기 증빙함"
            meta="화면 가장자리의 둥근 버튼에 영수증 파일을 끌어다 놓으면 서버에 보관되고, 이 화면의 확인 대기함으로 들어옵니다."
          />
          <div className="px-4 py-4">
            {files.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {files.map((f) => (
                  <Button key={f.label} asChild variant="outline" className="h-auto py-2">
                    <a href={f.url} download>
                      <Download className="h-4 w-4" aria-hidden />
                      <span className="text-left">
                        <span className="block text-sm font-semibold text-dark">{f.label}</span>
                        <span className="block text-xs font-normal text-text-secondary">{f.note}</span>
                      </span>
                    </a>
                  </Button>
                ))}
              </div>
            ) : (
              <InlineNotice tone="info">설치 파일을 불러오지 못했습니다. 잠시 후 새로고침하거나 담당자에게 요청하세요.</InlineNotice>
            )}
            <p className="mt-3 text-xs text-text-secondary">
              맥 칩 확인: 왼쪽 위 Apple 메뉴 › 이 Mac에 관하여 › 칩(Apple M…)이면 Apple 칩, 프로세서(Intel…)면 Intel
            </p>
          </div>
        </Panel>

        <div className="grid gap-4 md:grid-cols-2">
          <Panel>
            <PanelHeader as="h3" title="맥 설치" />
            <div className="px-4 py-4">
              <Steps
                items={[
                  "dmg 파일 열기",
                  "포연기 증빙함 아이콘을 응용 프로그램 폴더로 끌기",
                  <>
                    처음 실행 시: 응용 프로그램 폴더에서 아이콘 <b className="font-semibold">우클릭 › 열기</b> › 열기
                  </>,
                  "‘열 수 없음’이 뜨면: 시스템 설정 › 개인정보 보호 및 보안 › ‘그래도 열기’",
                ]}
              />
            </div>
          </Panel>
          <Panel>
            <PanelHeader as="h3" title="윈도우 설치" />
            <div className="px-4 py-4">
              <Steps
                items={[
                  "exe 파일 실행(설치는 자동 · 관리자 권한 불필요)",
                  <>
                    ‘Windows의 PC 보호’가 뜨면 <b className="font-semibold">추가 정보 › 실행</b>
                  </>,
                  "바탕화면·시작 메뉴의 포연기 증빙함으로 실행",
                ]}
              />
            </div>
          </Panel>
        </div>

        <Panel>
          <PanelHeader as="h3" title="사용법" meta="로그인은 이 관리자 화면과 같은 계정" />
          <div className="px-4 py-4">
            <Steps
              items={[
                "영수증·카드전표·세금계산서 파일(JPG·PNG·HEIC·PDF)을 둥근 버튼에 끌어다 놓기 · 여러 개 동시 가능",
                "버튼을 누르면 최근 업로드와 확인 대기 건수 · 기본 프로젝트를 고르면 표에 미리 선택됨",
                <>
                  이 화면의 <b className="font-semibold">증빙 올리기</b> 탭에서 내용 확인 · 프로젝트 선택 후 저장(저장 전에는 증빙
                  내역에 기록되지 않음)
                </>,
              ]}
            />
          </div>
        </Panel>
      </div>
    </div>
  )
}
