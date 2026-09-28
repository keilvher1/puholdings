// 사업비 정산 화면 공용 표현 조각.
// 원칙(redesign-spec): 업무용 소프트웨어 톤 · 1px 테두리(그림자 없음) · rounded-md · 색은 의미(오류·확인·완료)에만 ·
// 데이터·제약 문구는 text-text-secondary 이상(text-text-tertiary는 장식 전용) · 글자 12px(text-xs) 이상.
// 상태·로직은 두지 않는다(훅 없음). 서버·클라이언트 컴포넌트 어디서든 import할 수 있다.

import type { ComponentProps, ReactNode } from "react"
import { AlertCircle, CheckCircle2, ChevronRight, Loader2, TriangleAlert, X } from "lucide-react"
import { Kbd } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"
import { formatRate, rateTone, wonNumber } from "./client-helpers"

// ── 컨테이너 ─────────────────────────────────────────────────────────────────

// 카드 대신 쓰는 테두리 상자. 그림자·틴트 배경 없음.
export function Panel({
  as: Tag = "section",
  className,
  ...rest
}: Omit<ComponentProps<"section">, "ref"> & { as?: "section" | "div" | "article" }) {
  return <Tag className={cn("overflow-hidden rounded-md border border-warm-tan bg-card", className)} {...rest} />
}

// 섹션 제목(h2 기본). count는 제목 옆 보조 숫자(예: 인식 결과 5건).
export function SectionTitle({
  as: Tag = "h2",
  count,
  className,
  children,
}: {
  as?: "h2" | "h3" | "p"
  count?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <Tag className={cn("text-base font-semibold text-dark", className)}>
      {children}
      {count !== undefined && count !== null && count !== "" && (
        <span className="ml-1.5 font-normal tabular-nums text-text-secondary">{count}</span>
      )}
    </Tag>
  )
}

// Panel 머리 줄: 제목(+개수) · 한 줄 보조 설명 · 오른쪽 동작 버튼.
export function PanelHeader({
  title,
  count,
  meta,
  actions,
  as = "h2",
  className,
}: {
  title: ReactNode
  count?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  as?: "h2" | "h3" | "p"
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-warm-tan px-4 py-3", className)}>
      <div className="min-w-0">
        <SectionTitle as={as} count={count}>
          {title}
        </SectionTitle>
        {meta && <p className="mt-0.5 text-xs text-text-secondary [word-break:keep-all]">{meta}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

// ── 칩·상태 ──────────────────────────────────────────────────────────────────

export type ChipTone = "success" | "warning" | "danger" | "neutral"

// 대비(흰 바탕 기준): green-800/green-50 6.8 · amber-800/amber-50 6.8 · destructive/destructive-10 4.7 · dark/warm-beige 13.5
const CHIP_TONE: Record<ChipTone, string> = {
  success: "border-green-200 bg-green-50 text-green-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-destructive/40 bg-destructive/10 font-semibold text-destructive",
  neutral: "border-warm-tan bg-warm-beige text-dark",
}

// 글자로 된 작은 사각 태그. 알약(rounded-full)·아이콘을 쓰지 않는다.
export function Chip({
  tone = "neutral",
  title,
  className,
  children,
}: {
  tone?: ChipTone
  title?: string
  className?: string
  children: ReactNode
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 text-xs font-medium leading-none",
        CHIP_TONE[tone],
        title && "cursor-help",
        className
      )}
    >
      {children}
    </span>
  )
}

export type ExpenseStatus =
  | "ready" // 저장 가능
  | "review" // 확인 필요(저장은 가능)
  | "required" // 입력 필요(저장 불가)
  | "excluded" // 저장 대상에서 제외
  | "queued" // 대기
  | "processing" // 인식 중
  | "duplicate" // 이미 저장된 파일과 같음
  | "suspect" // 같은 거래로 보임
  | "error" // 처리 실패
  | "saved" // 저장됨·등록됨
  | "active" // 진행 중(프로젝트)
  | "closed" // 종료(프로젝트)

export const STATUS_META: Record<ExpenseStatus, { label: string; tone: ChipTone }> = {
  ready: { label: "저장 가능", tone: "success" },
  review: { label: "확인 필요", tone: "warning" },
  required: { label: "입력 필요", tone: "danger" },
  excluded: { label: "제외", tone: "neutral" },
  queued: { label: "대기", tone: "neutral" },
  processing: { label: "인식 중", tone: "neutral" },
  duplicate: { label: "중복", tone: "danger" },
  suspect: { label: "중복 의심", tone: "warning" },
  error: { label: "오류", tone: "danger" },
  saved: { label: "저장됨", tone: "success" },
  active: { label: "진행 중", tone: "success" },
  closed: { label: "종료", tone: "neutral" },
}

// 상태 칩. children으로 문구를 바꿀 수 있다. muted: 이미 저장 대상에서 빠진 행처럼 경고 색을 낮출 때(회색).
export function StatusChip({
  status,
  muted = false,
  title,
  className,
  children,
}: {
  status: ExpenseStatus
  muted?: boolean
  title?: string
  className?: string
  children?: ReactNode
}) {
  const meta = STATUS_META[status]
  return (
    <Chip tone={muted ? "neutral" : meta.tone} title={title} className={className}>
      {status === "processing" && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
      {children ?? meta.label}
    </Chip>
  )
}

// 표 행 아래 안내 한 줄: [머리말 칩] 짧은 상세. 긴 행동 안내는 title(툴팁)이나 HelpDetails로 보낸다.
export function RowNote({
  label,
  tone,
  title,
  className,
  children,
}: {
  label: ReactNode
  tone: ChipTone
  title?: string
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-5 [word-break:keep-all]", className)}>
      <Chip tone={tone} title={title}>
        {label}
      </Chip>
      {children && <span className={tone === "neutral" ? "text-text-secondary" : "text-dark"}>{children}</span>}
    </div>
  )
}

// ── 금액·비율 ────────────────────────────────────────────────────────────────

// 금액 표시: 천 단위 콤마 · tabular-nums · 줄바꿈 없음. 값이 없으면 "-".
// flag: 금액 불일치 등 경고 문구 — 숫자 왼쪽에 경고 아이콘(오른쪽 정렬 끝선 유지).
export function Money({
  value,
  unit = false,
  tone = "default",
  strong = false,
  flag,
  className,
}: {
  value: number | null | undefined
  unit?: boolean
  tone?: "default" | "muted" | "danger"
  strong?: boolean
  flag?: string | null
  className?: string
}) {
  const text = wonNumber(value)
  const hasValue = text !== "-"
  return (
    <span
      title={flag || undefined}
      className={cn(
        "inline-flex items-center justify-end gap-1 whitespace-nowrap tabular-nums",
        tone === "default" && "text-dark",
        tone === "muted" && "text-text-secondary",
        tone === "danger" && "text-destructive",
        strong && "font-semibold",
        className
      )}
    >
      {flag && (
        <>
          <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
          <span className="sr-only">{flag}</span>
        </>
      )}
      <span>
        {text}
        {unit && hasValue && "원"}
      </span>
    </span>
  )
}

// 집행률 막대(프로젝트 카드·증빙 내역 공용). 막대는 보조 표시이고 수치는 RateValue로 함께 보여 준다.
// 채움 대비(warm-beige 트랙 기준): dark/70 5.0 · amber-700 4.3 · destructive 4.3
const USAGE_FILL: Record<ReturnType<typeof rateTone>, string> = {
  none: "bg-transparent",
  ok: "bg-dark/70",
  warn: "bg-amber-700",
  over: "bg-destructive",
}

export function UsageBar({ rate, className }: { rate: number | null; className?: string }) {
  const tone = rateTone(rate)
  const width = rate === null ? 0 : Math.max(rate > 0 ? 1.5 : 0, Math.min(100, rate))
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-sm bg-warm-beige", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={rate === null ? undefined : Math.round(Math.min(100, rate))}
    >
      <div className={cn("h-full", USAGE_FILL[tone])} style={{ width: `${width}%` }} />
    </div>
  )
}

// 집행률 수치: 90% 이상 amber-700, 100% 초과 destructive(굵게), 그 외 text-dark.
export function RateValue({ rate, className }: { rate: number | null; className?: string }) {
  const tone = rateTone(rate)
  return (
    <span
      className={cn(
        "whitespace-nowrap tabular-nums",
        tone === "none" && "text-text-secondary",
        tone === "ok" && "font-medium text-dark",
        tone === "warn" && "font-medium text-amber-700",
        tone === "over" && "font-semibold text-destructive",
        className
      )}
    >
      {formatRate(rate)}
    </span>
  )
}

// ── 요약 수치 ────────────────────────────────────────────────────────────────

// 요약 띠: 테두리 하나 안에서 1px 구분선으로 나눈다(카드 여러 장 대신). 모바일 2열 · lg 4열.
export function SummaryStrip({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-md border border-warm-tan bg-warm-tan lg:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  )
}

// wide: 두 칸 차지(예: 프로젝트별 금액 목록). children: 막대·목록 등 추가 내용.
export function SummaryItem({
  label,
  value,
  sub,
  tone = "default",
  wide = false,
  className,
  children,
}: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  tone?: "default" | "danger"
  wide?: boolean
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={cn("min-w-0 bg-card px-4 py-3", wide && "col-span-2", className)}>
      <p className="text-xs font-medium text-text-secondary">{label}</p>
      <p
        className={cn(
          "mt-0.5 break-words text-lg font-bold tabular-nums lg:text-xl",
          tone === "danger" ? "text-destructive" : "text-dark"
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 break-words text-xs text-text-secondary [word-break:keep-all]">{sub}</p>}
      {children}
    </div>
  )
}

// ── 안내·빈 화면 ─────────────────────────────────────────────────────────────

// 빈 화면: 제목 한 줄 + 설명 한 줄 + 동작 하나. 장식 아이콘 없음.
export function EmptyState({
  title,
  description,
  action,
  bordered = false,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  bordered?: boolean
  className?: string
}) {
  return (
    <div className={cn("px-6 py-10 text-center", bordered && "rounded-md border border-warm-tan bg-card", className)}>
      <p className="text-sm font-semibold text-dark [word-break:keep-all]">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-lg text-sm text-text-secondary [word-break:keep-all]">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

export type NoticeTone = "info" | "success" | "warning" | "danger"

const NOTICE_TONE: Record<NoticeTone, string> = {
  info: "border-warm-tan bg-card text-dark",
  success: "border-green-200 bg-green-50 text-green-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-destructive/40 bg-destructive/5 text-destructive",
}

// 안내 한 줄(결과·경고·오류). 아이콘은 성공·경고·오류에만 붙는다(info는 글자만).
export function InlineNotice({
  tone = "info",
  action,
  onClose,
  closeLabel = "안내 닫기",
  role,
  className,
  children,
}: {
  tone?: NoticeTone
  action?: ReactNode
  onClose?: () => void
  closeLabel?: string
  role?: "status" | "alert"
  className?: string
  children: ReactNode
}) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? TriangleAlert : tone === "danger" ? AlertCircle : null
  return (
    <div
      role={role ?? (tone === "danger" ? "alert" : "status")}
      className={cn("flex flex-wrap items-start gap-x-2 gap-y-1.5 rounded-md border px-3 py-2 text-sm [word-break:keep-all]", NOTICE_TONE[tone], className)}
    >
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1">{children}</div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="-mr-1 shrink-0 rounded p-0.5 opacity-70 outline-none hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

// 접히는 도움말(기본 접힘). HelpNote(admin-ui, 관리비 정산과 공용) 대신 정산 화면에서 쓴다.
// items를 주면 명사형 목록으로 그린다.
export function HelpDetails({
  title,
  items,
  defaultOpen = false,
  className,
  children,
}: {
  title: string
  items?: ReactNode[]
  defaultOpen?: boolean
  className?: string
  children?: ReactNode
}) {
  return (
    <details open={defaultOpen} className={cn("group mt-4 rounded-md border border-warm-tan bg-card", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-sm font-medium text-dark outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-4 w-4 shrink-0 text-text-secondary group-open:rotate-90" aria-hidden />
        {title}
      </summary>
      <div className="border-t border-warm-tan px-4 py-3 text-sm leading-relaxed text-text-secondary [word-break:keep-all]">
        {items && items.length > 0 && (
          <ul className="list-disc space-y-1 pl-4 marker:text-text-tertiary">
            {items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        )}
        {children}
      </div>
    </details>
  )
}

// 처리 중 표시: 단순 스피너 + 글자(+ 경과 초). 진행률을 흉내 내는 막대·펄스는 쓰지 않는다.
export function BusyText({
  seconds,
  className,
  children,
}: {
  seconds?: number | null
  className?: string
  children: ReactNode
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-text-secondary", className)}>
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
      <span>
        {children}
        {typeof seconds === "number" && <span className="tabular-nums"> · {seconds}초</span>}
      </span>
    </span>
  )
}

// "A · B · C" 한 줄. 비어 있는 항목은 건너뛴다. 구분점만 장식색(text-text-tertiary).
export function DotList({ items, className }: { items: ReactNode[]; className?: string }) {
  const list = items.filter((x) => x !== null && x !== undefined && x !== false && x !== "")
  return (
    <span className={cn("inline", className)}>
      {list.map((it, i) => (
        <span key={i}>
          {i > 0 && (
            <span aria-hidden className="mx-1.5 text-text-tertiary">
              ·
            </span>
          )}
          {it}
        </span>
      ))}
    </span>
  )
}

// 키보드 단축키 표시(범례·저장 바). shadcn Kbd의 기본 색(4.15:1)을 대비 기준에 맞춘다.
export function KeyHint({ className, children }: { className?: string; children: ReactNode }) {
  return <Kbd className={cn("h-5 border border-warm-tan bg-card px-1.5 text-dark", className)}>{children}</Kbd>
}

// ── 입력 칸 상태(표·검토 창 공용) ────────────────────────────────────────────

// review: 인식이 불확실한 칸(확인 필요) · invalid: 저장할 수 없는 값(입력 오류).
// ring-inset으로 2px처럼 보이게 해 칸 크기가 바뀌지 않는다. amber-600 3.2:1 · destructive 5.4:1(흰 바탕).
export const CELL_TONE_CLASS = {
  review: "border-amber-600 bg-amber-50 ring-1 ring-inset ring-amber-600",
  invalid: "border-destructive bg-destructive/5 ring-1 ring-inset ring-destructive",
} as const

// 범례용 견본 칸: [견본] 확인 필요 · [견본] 입력 오류
export function CellSwatch({ kind, className }: { kind: keyof typeof CELL_TONE_CLASS; className?: string }) {
  return <span aria-hidden className={cn("inline-block h-3.5 w-5 shrink-0 rounded-sm border align-[-2px]", CELL_TONE_CLASS[kind], className)} />
}

// ── 표 ───────────────────────────────────────────────────────────────────────

// 표 공통 클래스. th: 베이지 머리(글자 text-dark 13.5:1) · td: 행 높이 40px 기준 · num: 금액 열.
export const TABLE_CLASS = {
  th: "h-9 whitespace-nowrap border-b border-warm-tan bg-warm-beige px-2 text-left align-middle text-xs font-semibold text-dark",
  td: "h-10 px-2 py-1.5 align-middle text-sm",
  num: "text-right tabular-nums whitespace-nowrap",
  row: "border-b border-warm-tan/70 even:bg-warm-ivory/40 hover:bg-warm-beige/50",
  foot: "border-t-2 border-warm-tan bg-warm-ivory font-semibold text-dark",
} as const

// 머리 고정용 스크롤 틀. shadcn <Table>은 자체 overflow 래퍼 때문에 sticky 머리가 붙지 않으므로
// 이 틀 안에 <table>을 직접 두고 TableHeader/TableRow/TableHead/TableCell을 쓴다. th에는 "sticky top-0 z-[1]"을 준다.
export function TableFrame({
  maxHeight = true,
  className,
  children,
}: {
  maxHeight?: boolean
  className?: string
  children: ReactNode
}) {
  return <div className={cn("relative w-full overflow-auto", maxHeight && "md:max-h-[70vh]", className)}>{children}</div>
}

// ── 모바일 행 카드(md 미만에서 표 대신) ─────────────────────────────────────
// 1줄: 제목(거래처) ↔ 금액 · 2줄: meta(날짜·문서 종류·결제) · 3줄: footer(프로젝트·상태 칩).
// leading(체크박스)·trailing(삭제 버튼)은 누름 영역 밖에 둔다(버튼 안에 버튼 금지).
export function RecordCard({
  title,
  amount,
  meta,
  footer,
  leading,
  trailing,
  onOpen,
  openLabel,
  tone = "default",
  className,
}: {
  title: ReactNode
  amount?: ReactNode
  meta?: ReactNode
  footer?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  onOpen?: () => void
  openLabel?: string
  tone?: "default" | "danger" | "warning" | "muted"
  className?: string
}) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-semibold text-dark">{title}</span>
        {amount !== undefined && <span className="shrink-0 text-base font-bold tabular-nums text-dark">{amount}</span>}
      </span>
      {meta && <span className="mt-0.5 block text-xs text-text-secondary">{meta}</span>}
      {footer && <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-dark">{footer}</span>}
    </>
  )
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border border-warm-tan bg-card px-3 py-2.5",
        tone === "danger" && "border-l-4 border-l-destructive",
        tone === "warning" && "border-l-4 border-l-amber-600",
        tone === "muted" && "bg-warm-ivory",
        className
      )}
    >
      {leading && <div className="flex shrink-0 items-center pt-0.5">{leading}</div>}
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={openLabel}
          className="block min-w-0 flex-1 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {body}
        </button>
      ) : (
        <div className="min-w-0 flex-1">{body}</div>
      )}
      {trailing && <div className="flex shrink-0 items-center">{trailing}</div>}
    </div>
  )
}
