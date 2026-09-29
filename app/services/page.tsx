import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ArrowUpRight, BarChart3, FilePenLine, Globe, Receipt, Settings, Zap, type LucideIcon } from "lucide-react"

// 통합 서비스 포털 — 포항연합기술지주가 운영하는 서비스를 한곳에 모은 입구 페이지.
// 업무용 입구라 검색 노출은 하지 않는다(관리자 화면 링크 포함).

export const metadata: Metadata = {
  title: "통합 서비스 | 포항연합기술지주",
  description: "포항연합기술지주가 운영하는 서비스를 한곳에서 만나보세요.",
  alternates: { canonical: "/services" },
  robots: { index: false, follow: false },
}

// 여백을 잘라낸 가로형 로고(public/images/logo-trim.png)
const LOGO_W = 465
const LOGO_H = 84

type Service = {
  title: string
  description: string
  href: string
  icon: LucideIcon
  tone: { tile: string; icon: string }
  external?: boolean
}

const SERVICES: Service[] = [
  {
    title: "사업비 정산",
    description: "영수증을 올리면 증빙 장부로 정리합니다",
    href: "/admin/expenses",
    icon: Receipt,
    tone: { tile: "bg-[#e8f0fe]", icon: "text-[#1a66d9]" },
  },
  {
    title: "관리비 정산",
    description: "전기료·관리비 월 마감과 청구서 발행",
    href: "/admin/billing",
    icon: Zap,
    tone: { tile: "bg-[#fff3e0]", icon: "text-[#c2620a]" },
  },
  {
    title: "스타트업 15분 경영진단",
    description: "우리 기업의 현재를 점검하세요",
    href: "https://start-fit.co.kr/",
    icon: BarChart3,
    tone: { tile: "bg-[#e8f0fe]", icon: "text-[#1a66d9]" },
    external: true,
  },
  {
    title: "24시간 첨삭 플랫폼",
    description: "언제든 문서를 점검하고 다듬으세요",
    href: "https://modu-changup.vercel.app/",
    icon: FilePenLine,
    tone: { tile: "bg-[#e3f5f8]", icon: "text-[#0b7a8f]" },
    external: true,
  },
  {
    title: "포항연합기술지주 어드민",
    description: "운영 및 관리 업무를 위한 공간",
    href: "/admin",
    icon: Settings,
    tone: { tile: "bg-[#efeafd]", icon: "text-[#5b3fc4]" },
  },
  {
    title: "포항연합기술지주 홈페이지",
    description: "회사 소개와 주요 소식을 확인하세요",
    href: "/",
    icon: Globe,
    tone: { tile: "bg-[#e8f0fe]", icon: "text-[#1a66d9]" },
  },
]

function ServiceCard({ s }: { s: Service }) {
  const Icon = s.icon
  const linkProps = s.external ? { target: "_blank", rel: "noopener noreferrer" } : {}
  return (
    <article className="flex flex-col rounded-xl border border-[#e3e8f0] bg-white p-7 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className={`flex h-16 w-16 items-center justify-center rounded-xl ${s.tone.tile}`} aria-hidden>
        <Icon className={`h-8 w-8 ${s.tone.icon}`} strokeWidth={2.2} />
      </div>
      <h2 className="mt-6 text-[22px] font-bold leading-snug tracking-tight text-[#0f172a] [word-break:keep-all] sm:text-2xl">
        {s.title}
      </h2>
      <p className="mt-2 text-base leading-relaxed text-[#4b5563] [word-break:keep-all]">{s.description}</p>
      <Link
        href={s.href}
        {...linkProps}
        className="mt-7 inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-lg bg-[#1f6feb] text-base font-semibold text-white transition-colors hover:bg-[#185cc7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f6feb] focus-visible:ring-offset-2"
        aria-label={`${s.title} 바로가기${s.external ? " (새 탭)" : ""}`}
      >
        바로가기
        <ArrowUpRight className="h-5 w-5" aria-hidden />
      </Link>
    </article>
  )
}

export default function ServicesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f5f7fb] text-[#0f172a]">
      <header className="border-b border-[#e6eaf2] bg-white">
        <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between px-5 sm:px-12">
          <Link href="/" className="flex items-center" aria-label="포항연합기술지주 홈페이지">
            <Image src="/images/logo-trim.png" alt="(주)포항연합기술지주" width={LOGO_W} height={LOGO_H} priority className="h-9 w-auto sm:h-10" />
          </Link>
          <span className="text-base text-[#4b5563] sm:text-lg">서비스 포털</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-5 py-12 sm:px-12 sm:py-16">
        <h1 className="text-4xl font-black tracking-tight text-[#0f172a] sm:text-5xl">통합 서비스</h1>
        <p className="mt-3 text-lg text-[#4b5563] sm:text-xl">필요한 서비스를 한곳에서 만나보세요.</p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s) => (
            <ServiceCard key={s.title} s={s} />
          ))}
        </div>
      </main>

      <footer className="mx-auto w-full max-w-[1440px] px-5 pb-8 sm:px-12">
        <div className="border-t border-[#e3e8f0] pt-5 text-center">
          <p className="text-sm text-[#4b5563]">포항연합기술지주</p>
          <p className="mt-1 text-xs text-[#6b7280]">© 2026 Pohang United Technology Holdings. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
