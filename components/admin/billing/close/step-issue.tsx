"use client"

// 4단계 발행 — 발행 전 확인 카드(나가는 것·납부 기한·자동 점검·'확인 필요' 목록·카드 안 PDF) → 확인창 하나 → 완료 화면.
// 사람이 누르는 "봤어요" 체크박스는 두지 않는다. 확인창 숫자 = 실제 발행 대상(bill_ids로 호출, 직전에 다시 조회해 같은지 확인).
// 메일이 꺼져 있으면(isMailEnabled=false) "메일이 가요"라고 말하지 않고, 완료 화면 주 버튼이 PDF 묶음 받기다(가드 #24).
// 납부 기한은 발행 UPDATE 안에서 비어 있는 청구서에만 채운다(issue 라우트, 가드 #25). PDF에 기한이 찍힌다고 말하지 않는다.

import { useMemo, useState, type ReactNode } from "react"
import { flushSync } from "react-dom"
import Link from "next/link"
import { ChevronRight, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  BusyButton,
  ConfirmDialog,
  EmptyState,
  FilePreview,
  Money,
  Notice,
  ResultCard,
  StickyActionBar,
  ToneBadge,
  toastInfo,
  toastSuccess,
  useConfirm,
} from "@/components/saas"
import { billMonthShort, dateShort, due, won } from "@/lib/format"
import { BILLING_CLOSE_STEP_NOTES } from "@/lib/help/billing-close"
import { billsHref, emailsHref, tenantsHref } from "@/lib/links"
import { friendlyError } from "@/lib/messages"
import { api, filenameFromResponse } from "./api"
import { baselineAlert, issueOutcome, mailErrorText, monthBaselinePct, needsReview, reviewReasonLabel, reviewReasons, sortByChange, validateDueDate } from "./close-model"
import { StepHelp } from "./step-help"
import type { CloseStatus, IssueResponse } from "./types"

function CheckLine({ tone, children }: { tone: "success" | "warning" | "danger" | "neutral"; children: ReactNode }) {
  const label = tone === "success" ? "완료" : tone === "warning" ? "확인" : tone === "danger" ? "문제" : "안내"
  return (
    <li className="flex items-start gap-2 py-1.5 text-[15px] leading-relaxed text-dark [word-break:keep-all]">
      <ToneBadge tone={tone} className="mt-0.5">
        {label}
      </ToneBadge>
      <span className="min-w-0">{children}</span>
    </li>
  )
}

function useZip(billMonth: string, label: string) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: "success" | "warning" | "danger"; text: string } | null>(null)
  const run = async () => {
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/admin/billing/bills/download?period=${billMonth}`, { credentials: "include" })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        setNotice({ tone: "danger", text: friendlyError(res.status, d?.error, "PDF 묶음을 만들지 못했어요.") })
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filenameFromResponse(res, `${label}.zip`)
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      const got = Number(res.headers.get("X-Invoice-Count"))
      const total = Number(res.headers.get("X-Invoice-Total"))
      if (Number.isFinite(got) && Number.isFinite(total) && got < total) {
        setNotice({ tone: "warning", text: `${total}건 중 ${got}건만 담겼어요. 빠진 기업은 zip 안 _안내.txt에서 확인해 주세요` })
      } else {
        toastSuccess(`${label} ${Number.isFinite(got) ? `${got}건을` : ""} 내려받았어요`)
      }
    } catch {
      setNotice({ tone: "danger", text: friendlyError(0, null, "PDF 묶음을 받지 못했어요.") })
    } finally {
      setBusy(false)
    }
  }
  return { busy, notice, run }
}

export function StepIssue({
  status,
  today,
  mailEnabled,
  onGoStep,
  reload,
  afterWrite,
  onPrev,
}: {
  status: CloseStatus
  today: string
  mailEnabled: boolean
  onGoStep: (n: 1 | 2 | 3 | 4) => void
  /** close-status 다시 읽기(실패하면 null) */
  reload: () => Promise<CloseStatus | null>
  /** 쓰기 뒤 상태 다시 읽기 + 사이드바 배지 갱신 */
  afterWrite: () => Promise<void>
  onPrev: () => void
}) {
  const ask = useConfirm()
  const bmName = `${billMonthShort(status.billMonth, today)} 청구서`
  const zip = useZip(status.billMonth, `${bmName} PDF`)
  const iss = status.issue
  const draftRows = useMemo(() => status.rows.filter((r) => r.status === "draft"), [status.rows])
  const sortedDrafts = useMemo(() => sortByChange(draftRows), [draftRows])
  const existingDue = [...new Set(draftRows.map((r) => r.dueDate).filter((d): d is string => !!d))]
  const allHaveDue = iss.count > 0 && iss.withDueDate === iss.count

  const [dueDate, setDueDate] = useState(iss.dueSuggestion)
  const [dueError, setDueError] = useState<string | null>(null)
  const [force, setForce] = useState(false)
  const [open, setOpen] = useState(false)
  const [previewId, setPreviewId] = useState<number | null>(null)
  const [checking, setChecking] = useState(false)
  /** 이 화면에서 방금 발행한 결과(완료 화면에 정정 재발행 건수를 보이려고 남겨 둔다) */
  const [lastIssue, setLastIssue] = useState<IssueResponse | null>(null)
  const pickedPreview = previewId ?? sortedDrafts[0]?.billId ?? null
  const issuedAll = status.bills.issued + status.bills.overdue + status.bills.paid

  const baseline = monthBaselinePct(status.rows)
  const flagged = sortByChange(draftRows.filter((r) => !r.isManual && needsReview(r, baseline)))
  const manualDrafts = draftRows.filter((r) => r.isManual).length

  const startIssue = async () => {
    if (!allHaveDue) {
      const e = validateDueDate(dueDate, today)
      setDueError(e)
      if (e) {
        requestAnimationFrame(() => {
          const el = document.getElementById("f-dueDate")
          el?.focus()
          el?.scrollIntoView({ block: "center" })
        })
        return
      }
    }
    let useForce = force
    if (iss.staleElec.length > 0 && !useForce) {
      const r = await ask({
        title: "전기료가 아직 계산되지 않았어요",
        body: `${iss.staleElec.slice(0, 3).join(", ")}${iss.staleElec.length > 3 ? ` 외 ${iss.staleElec.length - 3}곳` : ""}의 청구서에 전기료가 0원으로 들어가 있어요.`,
        consequences: ["2단계에서 전기료를 저장하고 3단계에서 다시 만들면 고칠 수 있어요", "이대로 발행하면 전기료 0원 청구서가 나가요"],
        confirmLabel: "전기료 입력하러 가기",
        altAction: { label: "0원으로 진행", tone: "danger" },
      })
      if (r === true) return onGoStep(2)
      if (r !== "alt") return
      useForce = true
      setForce(true)
    }
    // 확인창 숫자 = 실제 발행 대상: 직전에 다시 읽어 대상이 같은지 확인한다
    // 확인하는 동안 버튼이 꺼져(disabled) 초점이 body로 빠진다. 다시 켠 뒤 버튼으로 초점을 돌려놔야
    // 확인창을 닫았을 때 초점이 이 버튼으로 돌아온다(components/ui/use-return-focus.ts).
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
    setChecking(true)
    const fresh = await reload().finally(() => flushSync(() => setChecking(false)))
    if (opener?.isConnected) opener.focus({ preventScroll: true })
    if (!fresh) {
      toastInfo("발행할 청구서를 다시 확인하지 못했어요. 잠시 뒤 다시 눌러 주세요")
      return
    }
    const same = fresh.issue.billIds.length === iss.billIds.length && fresh.issue.billIds.every((id) => iss.billIds.includes(id))
    if (!same) {
      toastInfo("발행할 청구서가 바뀌어 다시 불러왔어요. 숫자를 확인하고 다시 눌러 주세요")
      return
    }
    setOpen(true)
  }

  const runIssue = async (): Promise<void | { error: string }> => {
    const res = await api<IssueResponse>("/api/admin/billing/bills/issue", {
      method: "POST",
      json: { bill_ids: iss.billIds, ...(allHaveDue ? {} : { due_date: dueDate }), ...(force ? { force: true } : {}) },
    })
    if (res.ok && res.data?.success) {
      setLastIssue(res.data)
      await afterWrite()
      toastSuccess(`${bmName} ${res.data.issued ?? 0}건을 발행했어요`)
      return
    }
    if (res.data?.needs_regenerate) {
      return { error: `전기료가 0원으로 들어간 청구서가 있어 발행하지 않았어요(${(res.data.stale ?? []).slice(0, 3).join(", ")}). 2단계에서 전기료를 저장하고 3단계에서 다시 만든 뒤 발행해 주세요.` }
    }
    return { error: friendlyError(res.status, res.error, "발행하지 못했어요.") }
  }

  // ── 완료 화면(발행 대상 없음 + 발행분 있음) ───────────────────────────────
  if (iss.count === 0) {
    if (issuedAll === 0) {
      return (
        <div>
          <EmptyState
            kind="first-use"
            title="발행할 청구서가 없어요"
            description="3단계에서 청구서를 먼저 만들어 주세요"
            action={
              <Button type="button" onClick={() => onGoStep(3)}>
                3단계로 가기
              </Button>
            }
            bordered
          />
          <StickyActionBar
            secondary={
              <Button type="button" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={onPrev}>
                이전
              </Button>
            }
          />
        </div>
      )
    }
    const out = issueOutcome(status.rows)
    // 메일 결과는 실제 기록(issued_at 이후 로그)으로 말한다. 보낸 기록이 없을 때만 "나가지 않았어요"(메일 꺼짐)
    const attempted = out.sent + out.failed.length > 0
    // 방금 이 화면에서 발행했고 정정 재발행이 섞였으면 그 건수(새로 고치면 구분할 수 없어 보이지 않는다)
    const corrected = (lastIssue?.corrected ?? 0) > 0 ? [{ label: "그중 정정 재발행", value: `${lastIssue!.corrected}건${mailEnabled ? "(메일 제목에 [정정])" : ""}` }] : []
    const rows = attempted || mailEnabled
      ? [
          { label: "발행", value: `${out.issued}건` },
          ...corrected,
          { label: "합계", value: out.total, emphasis: true },
          { label: "메일 보냄", value: `${out.sent}건` },
          { label: "보내지 못함", value: `${out.failed.length + out.notConfigured}건` },
          { label: "이메일 없음", value: `${out.noEmail.length}건` },
          ...(out.noLog > 0 ? [{ label: "이번 발행 뒤 메일 기록 없음", value: `${out.noLog}건` }] : []),
          { label: "납부 완료", value: `${status.bills.paid}건` },
        ]
      : [
          { label: "발행", value: `${out.issued}건` },
          ...corrected,
          { label: "합계", value: out.total, emphasis: true },
          { label: "입주기업 포털", value: "보여요" },
          { label: "메일", value: "나가지 않았어요(메일 발송 설정 안 됨)" },
          { label: "납부 완료", value: `${status.bills.paid}건` },
        ]
    const zipButton = (
      <BusyButton type="button" busy={zip.busy} busyLabel="묶는 중…" variant={mailEnabled ? "outline" : "default"} className={mailEnabled ? "hover:bg-warm-beige hover:text-dark" : undefined} onClick={zip.run} size="sm">
        <Download aria-hidden />
        {bmName} PDF 전체 받기(zip)
      </BusyButton>
    )
    return (
      <div className="space-y-4">
        <ResultCard
          title={`${bmName} ${out.issued}건을 발행했어요`}
          rows={rows}
          notes={[
            ...(!mailEnabled && !attempted ? ["메일이 나가지 않았으니 PDF를 받아 기업에 직접 전달해 주세요"] : []),
            ...(!mailEnabled && attempted ? ["지금은 메일 발송이 설정되지 않아, 다시 발행하면 메일이 나가지 않아요"] : []),
            "입금이 확인되면 청구서 화면에서 납부 처리해 주세요",
          ]}
          actions={
            <>
              {zipButton}
              <Button asChild variant="outline" size="sm" className="hover:bg-warm-beige hover:text-dark">
                <Link href={billsHref({ view: "receivable", period: status.billMonth })}>
                  받을 돈 보기
                  <ChevronRight aria-hidden />
                </Link>
              </Button>
            </>
          }
        />
        {zip.notice && <Notice tone={zip.notice.tone}>{zip.notice.text}</Notice>}
        {out.failed.length > 0 && (
          <section aria-labelledby="mail-failed" className="rounded-md border border-warm-tan bg-card px-4 py-3 sm:px-5">
            <h3 id="mail-failed" className="text-base font-semibold text-dark">
              메일을 보내지 못한 곳 {out.failed.length}곳
            </h3>
            <ul className="mt-1 divide-y divide-warm-tan/70">
              {out.failed.map((r) => (
                <li key={r.billId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[15px]">
                  <span className="min-w-0 [word-break:keep-all]">
                    <b className="font-medium">{r.tenantName}</b> · {mailErrorText(r.mail?.error)}
                  </span>
                  <span className="flex flex-wrap gap-3">
                    <Link className="text-link underline underline-offset-2" href={tenantsHref({ tenant: r.tenantId, card: "contact" })}>
                      기업 정보
                    </Link>
                    <Link className="text-link underline underline-offset-2" href={emailsHref({ status: "failed", type: "bill_issued", q: r.tenantName })}>
                      메일 기록
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {out.noEmail.length > 0 && (
          <section aria-labelledby="no-email" className="rounded-md border border-warm-tan bg-card px-4 py-3 sm:px-5">
            <h3 id="no-email" className="text-base font-semibold text-dark">
              이메일이 없어 PDF를 직접 전달할 곳 {out.noEmail.length}곳
            </h3>
            <ul className="mt-1 divide-y divide-warm-tan/70">
              {out.noEmail.map((r) => (
                <li key={r.billId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[15px]">
                  <b className="font-medium">{r.tenantName}</b>
                  <span className="flex flex-wrap gap-3">
                    <a className="text-link underline underline-offset-2" href={`/api/admin/billing/bills/preview?id=${r.billId}`} target="_blank" rel="noreferrer">
                      PDF 열기
                    </a>
                    <Link className="text-link underline underline-offset-2" href={tenantsHref({ tenant: r.tenantId, card: "contact" })}>
                      기업 정보에서 메일 넣기
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <StepHelp notes={BILLING_CLOSE_STEP_NOTES.issue} />
        <StickyActionBar
          summary={`발행 ${out.issued}건 · 납부 완료 ${status.bills.paid}건`}
          secondary={
            <Button type="button" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={onPrev}>
              이전
            </Button>
          }
        />
      </div>
    )
  }

  // ── 발행 전 확인 카드 ───────────────────────────────────────────────────
  const { meters, allocation } = status
  const confirmLabel = `${iss.count}건 발행하기`
  const primaryLabel = mailEnabled ? `${iss.count}건 발행하고 메일 보내기` : `${iss.count}건 발행하기`
  const dueText = allHaveDue ? (existingDue.length === 1 ? dateShort(existingDue[0], today) : "기업마다 원래 기한") : dateShort(dueDate, today)

  return (
    <div>
      <Notice tone="info" className="mb-3 sm:hidden">
        월 마감 발행은 PC에서 해 주세요. 휴대폰에서는 숫자와 PDF를 확인하기 어려워요.
      </Notice>
      <section aria-labelledby="issue-title" className="rounded-md border border-warm-tan bg-card">
        <div className="border-b border-warm-tan px-4 py-3 sm:px-5">
          <h2 id="issue-title" className="text-lg font-semibold text-dark">
            4단계 · {bmName}를 보내기 전에 확인해요
          </h2>
        </div>

        {/* 나가는 것 */}
        <div className="border-b border-warm-tan px-4 py-4 sm:px-5">
          <h3 className="text-base font-semibold text-dark">나가는 것</h3>
          <p className="mt-1 text-[15px] leading-relaxed text-dark [word-break:keep-all]">
            청구서 <b>{iss.count}건</b> · 합계 <Money value={iss.total} strong />
            {mailEnabled && (
              <>
                {" "}
                · 메일 {iss.mailable}곳 · 이메일 없음 {iss.noEmail.length}곳
              </>
            )}
            {issuedAll > 0 && <> · 이미 발행 {issuedAll}건</>}
          </p>
          <BusyButton type="button" size="sm" variant="outline" className="mt-2 hover:bg-warm-beige hover:text-dark sm:hidden" busy={zip.busy} busyLabel="묶는 중…" onClick={zip.run}>
            <Download aria-hidden />
            PDF 전체 받기(zip)
          </BusyButton>
          {!mailEnabled && (
            <Notice tone="info" className="mt-2">
              메일 발송이 설정되지 않았어요. 발행하면 입주기업 포털에만 보이고, PDF는 직접 보내야 해요.
            </Notice>
          )}
          <div className="mt-3 grid max-w-md gap-1.5">
            {allHaveDue ? (
              <p className="text-[15px] text-dark">
                납부 기한: <b className="font-medium">{dueText}</b>
                <span className="block text-sm text-text-secondary">이미 기한이 있는 청구서라 원래 기한을 그대로 둬요.</span>
              </p>
            ) : (
              <>
                <Label htmlFor="f-dueDate" className="text-base">
                  납부 기한
                </Label>
                <Input
                  id="f-dueDate"
                  type="date"
                  value={dueDate}
                  min={today}
                  onChange={(e) => {
                    setDueDate(e.target.value)
                    if (dueError) setDueError(validateDueDate(e.target.value, today))
                  }}
                  aria-invalid={dueError ? true : undefined}
                  aria-describedby={dueError ? "f-dueDate-error f-dueDate-hint" : "f-dueDate-hint"}
                  className="w-48 text-base"
                />
                {dueError && (
                  <p id="f-dueDate-error" role="alert" className="text-sm text-red-800">
                    {dueError}
                  </p>
                )}
                <p id="f-dueDate-hint" className="text-sm text-text-secondary [word-break:keep-all]">
                  {dueDate && !dueError ? `${due(dueDate, today)} · ` : ""}
                  {mailEnabled ? "포털과 메일에 이 날짜가 보여요" : "포털에 이 날짜가 보여요"}(PDF에는 찍히지 않아요). 제안: {iss.dueRule}
                  {iss.withDueDate > 0 && ` · 이미 기한이 있는 ${iss.withDueDate}건은 원래 기한을 그대로 둬요`}
                </p>
              </>
            )}
          </div>
        </div>

        {/* 자동 점검 */}
        <div className="border-b border-warm-tan px-4 py-4 sm:px-5">
          <h3 className="text-base font-semibold text-dark">자동 점검</h3>
          <ul className="mt-1">
            <CheckLine tone={meters.saved === meters.total && meters.negative === 0 ? "success" : "warning"}>
              검침 {meters.total}개 중 {meters.saved}개 입력{meters.negative > 0 ? ` · 오류 ${meters.negative}개` : ""}
            </CheckLine>
            <CheckLine tone={allocation.checkOk && allocation.per10Confirmed !== null ? "success" : "warning"}>
              {allocation.per10Confirmed === null
                ? "10평당 단가가 확정되지 않았어요"
                : allocation.checkOk
                  ? `배분 정상 · 10평당 ${won(allocation.per10Confirmed)} 확정`
                  : `배분 확인 필요 · 10평당 ${won(allocation.per10Confirmed)}`}
            </CheckLine>
            <CheckLine tone={iss.staleElec.length === 0 ? "success" : "danger"}>
              {iss.staleElec.length === 0 ? "전기료 0원 청구서 없음" : `전기료가 0원으로 들어간 기업 ${iss.staleElec.length}곳: ${iss.staleElec.join(", ")}`}
            </CheckLine>
            {mailEnabled &&
              (iss.noEmail.length === 0 ? (
                <CheckLine tone="success">모든 기업에 받을 메일 주소가 있어요</CheckLine>
              ) : (
                <CheckLine tone="warning">
                  이메일 없는 기업 {iss.noEmail.length}곳:{" "}
                  {iss.noEmail.map((t, i) => (
                    <span key={t.tenantId}>
                      {i > 0 && ", "}
                      {t.name}{" "}
                      <Link className="whitespace-nowrap text-link underline underline-offset-2" href={tenantsHref({ tenant: t.tenantId, card: "contact" })}>
                        기업 정보에서 입력
                      </Link>
                    </span>
                  ))}
                </CheckLine>
              ))}
            {iss.correcting > 0 && <CheckLine tone="neutral">정정 재발행 {iss.correcting}건이 함께 나가요{mailEnabled ? "(메일 제목에 [정정])" : ""}</CheckLine>}
            {manualDrafts > 0 && <CheckLine tone="neutral">수기 청구서 {manualDrafts}건이 함께 발행돼요</CheckLine>}
          </ul>
        </div>

        {/* 3단계 확인 필요 */}
        <div className="border-b border-warm-tan px-4 py-4 sm:px-5">
          <h3 className="text-base font-semibold text-dark">3단계 ‘확인 필요’ {flagged.length}건</h3>
          {baselineAlert(baseline) && <p className="mt-1 text-[15px] font-medium text-amber-800 [word-break:keep-all]">{baselineAlert(baseline)}</p>}
          {flagged.length === 0 ? (
            <p className="mt-1 text-[15px] text-[#3f3f4e]">지난달보다 크게 달라진 곳·신규·0원·전기 0원이 없어요</p>
          ) : (
            <ul className="mt-1 divide-y divide-warm-tan/70">
              {flagged.map((r) => {
                const diff = r.prevTotal === null ? null : r.total - r.prevTotal
                const pct = diff !== null && r.prevTotal ? Math.round((diff / r.prevTotal) * 1000) / 10 : null
                return (
                  <li key={r.billId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-[15px]">
                    <span className="min-w-0 [word-break:keep-all]">
                      <b className="font-medium text-dark">{r.tenantName}</b>{" "}
                      <span className="tabular-nums text-dark">
                        {diff === null ? `신규 ${won(r.total)}` : `${diff >= 0 ? "+" : "−"}${won(Math.abs(diff))}${pct !== null ? `(${diff >= 0 ? "+" : "−"}${Math.abs(pct)}%)` : ""}`}
                      </span>{" "}
                      <span className="text-[#3f3f4e]">{[...r.events, ...reviewReasons(r, baseline).map((x) => reviewReasonLabel(x, r, baseline))].join(" · ")}</span>
                    </span>
                    <button type="button" className="inline-flex min-h-8 items-center text-link underline underline-offset-2 hover:text-dark" onClick={() => onGoStep(3)}>
                      3단계에서 보기
                      <ChevronRight className="size-4" aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* 카드 안 PDF 미리보기 */}
        <div className="px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h3 className="text-base font-semibold text-dark">변동이 가장 큰 기업 청구서</h3>
            {sortedDrafts.length > 1 && (
              <div className="grid gap-1">
                <Label htmlFor="issue-preview-pick" className="text-sm text-[#3f3f4e]">
                  다른 기업 고르기
                </Label>
                <Select value={pickedPreview ? String(pickedPreview) : undefined} onValueChange={(v) => setPreviewId(Number(v))}>
                  <SelectTrigger id="issue-preview-pick" className="w-64 max-w-full bg-card">
                    <SelectValue placeholder="기업 고르기" />
                  </SelectTrigger>
                  <SelectContent className="app-shell">
                    {sortedDrafts.map((r) => (
                      <SelectItem key={r.billId} value={String(r.billId)}>
                        {r.tenantName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <p className="mt-1 text-sm text-text-secondary">PDF에는 납부 기한이 찍히지 않아요. 기한은 {mailEnabled ? "포털과 메일" : "포털"}에서 보여요.</p>
          {pickedPreview && (
            <FilePreview
              url={`/api/admin/billing/bills/preview?id=${pickedPreview}`}
              type="application/pdf"
              name={`${draftRows.find((r) => r.billId === pickedPreview)?.tenantName ?? ""} ${bmName}`}
              height="520px"
              className="mt-2"
            />
          )}
        </div>
      </section>

      {zip.notice && (
        <Notice tone={zip.notice.tone} className="mt-4">
          {zip.notice.text}
        </Notice>
      )}
      <StepHelp notes={BILLING_CLOSE_STEP_NOTES.issue} className="mt-4" />

      <StickyActionBar
        summary={<span className="max-sm:hidden">{`청구서 ${iss.count}건 · 합계 ${won(iss.total)}`}</span>}
        secondary={
          <>
            <Button type="button" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={onPrev}>
              이전
            </Button>
            <BusyButton type="button" variant="outline" className="hover:bg-warm-beige hover:text-dark max-sm:hidden" busy={zip.busy} busyLabel="묶는 중…" onClick={zip.run}>
              PDF 전체 받기(zip)
            </BusyButton>
          </>
        }
        primary={
          <BusyButton type="button" busy={checking} busyLabel="확인하는 중…" onClick={startIssue}>
            {primaryLabel}
          </BusyButton>
        }
      />

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`${bmName} ${iss.count}건을 발행할까요?`}
        summary={[
          { label: "청구서", value: `${iss.count}건` },
          { label: "합계", value: won(iss.total) },
          { label: "메일", value: mailEnabled ? `${iss.mailable}곳` : "보내지 않음(설정 안 됨)" },
          ...(mailEnabled ? [{ label: "이메일 없음", value: `${iss.noEmail.length}곳` }] : []),
          { label: "납부 기한", value: dueText },
        ]}
        consequences={
          mailEnabled
            ? [
                `입주기업 포털에 바로 보이고 ${iss.mailable}곳에 메일이 가요`,
                ...(iss.noEmail.length > 0 ? [`이메일 없는 ${iss.noEmail.length}곳은 PDF를 따로 전달해야 해요`] : []),
                "발행 뒤에 고치려면 정정 절차가 필요해요",
              ]
            : ["입주기업 포털에 바로 보여요. 메일은 나가지 않으니 PDF를 직접 전달해 주세요", "발행 뒤에 고치려면 정정 절차가 필요해요"]
        }
        confirmLabel={confirmLabel}
        busyLabel="발행 중… 창을 닫지 마세요"
        failedTitle="발행을 끝내지 못했어요"
        retryable={false}
        onConfirm={runIssue}
        onFailed={() => {
          void afterWrite()
        }}
      />
    </div>
  )
}
