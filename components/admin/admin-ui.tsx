// 관리자 페이지 공용 프리미티브 — 반복되던 헤더/카드 스타일을 통일한다.

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-dark">{title}</h1>
        {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function AdminCard({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`overflow-hidden rounded-xl border border-warm-tan bg-card shadow-sm ${className}`}>
      {children}
    </div>
  )
}

// ── 설명 프리미티브 ────────────────────────────────────────────────────────────
// 정산 화면이 "무슨 값을 어디서 가져와 넣는 건지 모르겠다"는 피드백을 받아 추가.
// 항상 보이는 요약(StepIntro)과 접히는 상세(HelpNote)를 구분해 화면이 길어지지 않게 한다.

export function StepIntro({
  children,
  tone = "info",
}: {
  children: React.ReactNode
  tone?: "info" | "warn"
}) {
  const cls =
    tone === "warn"
      ? "border-gold/40 bg-gold/5"
      : "border-warm-tan bg-warm-beige/40"
  return (
    <div className={`mb-5 rounded-md border ${cls} px-4 py-3 text-sm leading-relaxed text-text-secondary [word-break:keep-all]`}>
      {children}
    </div>
  )
}

export function HelpNote({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details open={defaultOpen} className="group mt-3 rounded-md border border-warm-tan bg-warm-beige/25">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:text-dark">
        <span className="mr-1.5 inline-block transition-transform group-open:rotate-90">▸</span>
        {title}
      </summary>
      <div className="border-t border-warm-tan/60 px-3 py-2.5 text-xs leading-[1.85] text-text-secondary [word-break:keep-all]">
        {children}
      </div>
    </details>
  )
}
