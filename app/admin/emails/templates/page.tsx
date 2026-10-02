import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getSession } from "@/lib/auth"
import { Notice, PageHeader } from "@/components/saas"
import { isDailyCheckEnabled, isMailEnabled } from "@/lib/runtime-flags"
import { EmailTemplatesManager } from "@/components/admin/email-templates-manager"

export const metadata = { title: "메일 템플릿" }

export default async function AdminEmailTemplatesPage() {
  const session = await getSession()
  if (!session) redirect("/admin/login")
  const mailEnabled = isMailEnabled()
  const dailyCheck = isDailyCheckEnabled()

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* 상위로 가는 길. PageHeader breadcrumbs는 구분 기호 <li>가 <li> 안에 들어가 하이드레이션 오류가 나서(WP0a에 요청) 링크로 둔다 */}
      <Link href="/admin/emails" className="mb-1.5 inline-flex min-h-8 items-center gap-1 text-[15px] text-link underline underline-offset-2 hover:text-dark">
        <ArrowLeft className="size-4" aria-hidden />
        메일
      </Link>
      <PageHeader title="메일 템플릿" description="메일이 나갈 때 쓰는 제목과 본문을 고쳐요" />
      {!mailEnabled ? (
        <Notice tone="info" title="메일 발송이 설정되지 않았어요" className="mb-4">
          지금은 아래 메일이 하나도 나가지 않아요. 여기서 고친 내용은 메일 발송이 설정된 뒤부터 쓰여요.
        </Notice>
      ) : !dailyCheck ? (
        <Notice tone="info" title="매일 자동 점검이 꺼져 있어요" className="mb-4">
          납부 안내·제출 독촉 메일은 나가지 않아요. 다른 메일은 해당 작업을 할 때 나가요.
        </Notice>
      ) : null}
      <EmailTemplatesManager />
    </div>
  )
}
