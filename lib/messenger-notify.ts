import { after } from "next/server"
import type { getDb } from "@/lib/db"
import { formatWon } from "@/lib/billing"

// 업무 이벤트 → 메신저 "시스템 알림" 토픽.
// 라우트에서는 notify*() 한 줄만 부른다. 실제 글 쓰기는 lib/messenger.ts의 postSystemMessage()
// 단일 진입점으로 하고, after()로 응답을 보낸 뒤에 실행한다(응답을 늦추지 않고, 실패해도 본 작업은 성공).
// 요청 범위 밖(스크립트·단위 테스트)에서는 after()가 throw하므로 알림을 조용히 생략한다.

type Sql = NonNullable<ReturnType<typeof getDb>>

export interface AlertInfo {
  title: string
  description: string
}

export interface SystemAlert {
  text: string
  info: AlertInfo[]
}

// 연달아 도착한 증빙을 한 묶음으로 보는 간격
export const INBOX_BURST_WINDOW_MINUTES = 3

function clip(v: string, max: number): string {
  const s = v.replace(/\s+/g, " ").trim()
  return s.length > max ? `${s.slice(0, max)}…` : s
}

// 본문의 간단 마크다운(**, `, [], ())이 사용자 입력 때문에 깨지지 않도록 기호를 비슷한 글자로 바꾼다.
function plain(v: string): string {
  return v.replace(/[*`[\]]/g, (c) => ({ "*": "＊", "`": "'", "[": "［", "]": "］" })[c] ?? c)
}

function deferAlert(build: () => Promise<SystemAlert | null> | SystemAlert | null): void {
  try {
    after(async () => {
      try {
        const alert = await build()
        if (!alert) return
        const { postSystemMessage } = await import("@/lib/messenger")
        await postSystemMessage({ slug: "alerts", text: alert.text, info: alert.info })
      } catch (error) {
        console.error("[messenger] 시스템 알림을 남기지 못했습니다:", error)
      }
    })
  } catch {
    // after()를 쓸 수 없는 환경 — 알림 생략
  }
}

// ── 공개 문의 접수 ────────────────────────────────────────────────────────────

// 연락처(이메일·전화)는 메신저에 남기지 않는다 — 메시지는 영구 보관되고 참여자 범위가 넓어질 수 있다.
// 연락처는 문의 관리 화면에서 확인한다.
export interface InquiryAlertInput {
  name: string
  company: string
  message: string
}

export function inquiryAlert(v: InquiryAlertInput): SystemAlert {
  const who = plain(clip(v.name, 40)) + (v.company ? ` (${plain(clip(v.company, 60))})` : "")
  return {
    text: `**새 문의** · ${who}\n[문의 관리에서 보기](/admin/inquiries)`,
    info: [{ title: "문의 내용", description: clip(v.message, 200) }],
  }
}

export function notifyInquiry(v: InquiryAlertInput): void {
  deferAlert(() => inquiryAlert(v))
}

// ── 데스크톱 앱 증빙 도착(확인 대기함) ────────────────────────────────────────

export interface InboxAlertInput {
  id: number
  file_name: string
  scan_status: "ok" | "failed" | "not_configured"
  first: { vendor_name: string | null; total_amount: number | null } | null
  pending: number
}

// recentBefore: 이 증빙 직전 INBOX_BURST_WINDOW_MINUTES분 안에 먼저 도착한 증빙 수.
// 첫 도착이면 파일명·거래처·금액을 자세히, 연달아 오는 중이면 대기 건수 요약만 새 메시지로 보낸다
// (앞 메시지를 고치거나 합치지 않는다).
export function inboxAlert(v: InboxAlertInput, recentBefore: number): SystemAlert {
  if (recentBefore > 0) {
    return { text: `증빙 추가 도착 · 확인 대기 **${v.pending}건**`, info: [] }
  }
  const info: AlertInfo[] = []
  if (v.first) {
    const vendor = v.first.vendor_name?.trim() || "거래처 미인식"
    const amount = v.first.total_amount != null ? `${formatWon(v.first.total_amount)}원` : "금액 미인식"
    info.push({ title: "거래처 · 금액", description: `${vendor} · ${amount}` })
  } else {
    info.push({
      title: "자동 인식",
      description: v.scan_status === "not_configured" ? "미설정 · 웹에서 직접 입력" : "인식하지 못함 · 웹에서 직접 입력",
    })
  }
  return {
    text: `**증빙 도착** · ${plain(clip(v.file_name, 80))}\n확인 대기 **${v.pending}건** · [증빙 올리기에서 확인](/admin/expenses)`,
    info,
  }
}

export function notifyInboxArrival(sql: Sql, v: InboxAlertInput): void {
  deferAlert(async () => {
    const rows = await sql`
      SELECT count(*)::int AS n FROM expense_inbox
      WHERE id < ${v.id} AND created_at > now() - make_interval(mins => ${INBOX_BURST_WINDOW_MINUTES})
    `
    return inboxAlert(v, Number(rows[0]?.n ?? 0))
  })
}

// ── 관리비 청구서 발행 ────────────────────────────────────────────────────────

export interface BillsIssuedInput {
  bills: { period: string; total_amount: string | number }[]
  corrected: number
  sent: number
  failed: number
  no_email: string[]
}

export function billsIssuedAlert(v: BillsIssuedInput): SystemAlert | null {
  if (v.bills.length === 0) return null
  const periods = [...new Set(v.bills.map((b) => b.period))].sort()
  const total = v.bills.reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0)
  const mail = [`발송 ${v.sent}건`]
  if (v.failed > 0) mail.push(`실패 ${v.failed}건`)
  if (v.no_email.length > 0) {
    const names = v.no_email.slice(0, 3).join(", ") + (v.no_email.length > 3 ? ` 외 ${v.no_email.length - 3}곳` : "")
    mail.push(`메일 주소 없음 ${v.no_email.length}곳(${names})`)
  }
  const info: AlertInfo[] = [
    { title: "청구 합계", description: `${formatWon(total)}원` },
    { title: "메일", description: mail.join(" · ") },
  ]
  if (v.corrected > 0) info.push({ title: "정정 발행", description: `${v.corrected}건` })
  return {
    text: `**관리비 청구서 발행** · ${periods.join(", ")} ${v.bills.length}건\n[관리비 정산에서 보기](/admin/billing)`,
    info,
  }
}

export function notifyBillsIssued(v: BillsIssuedInput): void {
  deferAlert(() => billsIssuedAlert(v))
}
