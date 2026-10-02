"use client"

// 3단계 청구서 만들기 — 요약 4칸 + [확인 필요 n] [전체 n] 필터(기본 확인 필요) + 증감 절댓값 큰 순 표(안쪽 스크롤 없음) + PDF 미리보기 시트.
// 생성은 기존 generate 라우트를 그대로 부른다(수정 금지). 전기료 0원 강행은 경고 대화상자(주 버튼 "전기료 입력하러 가기"),
// 발행분 되돌리기는 정정 대화상자(A-8) — 사유는 issued_at 있는 draft를 다시 조회해 appendBillMemo로 메모에 덧붙인다.

import { useState } from "react"
import { ChevronRight, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  BusyButton,
  EmptyState,
  FilterTabs,
  Money,
  Notice,
  PdfPreviewSheet,
  StatusBadge,
  StickyActionBar,
  ToneBadge,
  toastSuccess,
  useConfirm,
  useUrlState,
} from "@/components/saas"
import { appendBillMemo } from "@/lib/bill-display"
import { billMonthShort, date, month, won, wonNum } from "@/lib/format"
import { BILLING_CLOSE_STEP_NOTES } from "@/lib/help/billing-close"
import { friendlyError } from "@/lib/messages"
import { api } from "./api"
import { baselineAlert, changeOf, monthBaselinePct, needsReview, reviewReasonLabel, reviewReasons, sortByChange } from "./close-model"
import { StepHelp } from "./step-help"
import type { CloseStatus, GenerateResponse, ReviewRow } from "./types"

const REASONS = ["검침 입력 오류", "한전 금액 정정", "계약·단가 변경"] as const

/** 정정 사유 고르기 — 확인창 본문(<p>) 안에 들어가므로 문장 요소(label·input·span)만 쓴다 */
function ReasonPicker({ onChange }: { onChange: (reason: string | null) => void }) {
  const [choice, setChoice] = useState<string | null>(null)
  const [other, setOther] = useState("")
  const pick = (v: string, text?: string) => {
    setChoice(v)
    onChange(v === "기타" ? (text ?? other).trim() || null : v)
  }
  return (
    <span className="mt-3 block rounded-md border border-warm-tan px-3 py-2 text-dark">
      <span className="block text-[15px] font-semibold">정정 사유(청구서 메모에 남겨요)</span>
      <span role="radiogroup" aria-label="정정 사유" className="mt-1 flex flex-col gap-1">
        {[...REASONS, "기타"].map((r) => (
          <label key={r} className="flex min-h-8 cursor-pointer items-center gap-2 text-[15px]">
            <input type="radio" name="correction-reason" value={r} checked={choice === r} onChange={() => pick(r)} className="size-4 accent-[#1f2235]" />
            {r === "기타" ? "기타(직접 입력)" : r}
          </label>
        ))}
      </span>
      {choice === "기타" && (
        <span className="mt-1 block">
          <label htmlFor="correction-other" className="sr-only">
            정정 사유 직접 입력
          </label>
          <input
            id="correction-other"
            value={other}
            maxLength={100}
            onChange={(e) => {
              setOther(e.target.value)
              pick("기타", e.target.value)
            }}
            placeholder="예: 3층 계약 면적 정정"
            className="h-9 w-full rounded-md border border-warm-tan bg-card px-3 text-[15px]"
          />
        </span>
      )}
    </span>
  )
}

function changeText(row: ReviewRow): string {
  const { diff, pct } = changeOf(row)
  if (diff === null) return "신규"
  if (diff === 0) return "같음"
  const sign = diff > 0 ? "+" : "−"
  return `${sign}${wonNum(Math.abs(diff))}원${pct !== null ? `(${sign}${Math.abs(pct)}%)` : ""}`
}

export function ReasonBadges({ row, baseline }: { row: ReviewRow; baseline: number }) {
  const reasons = row.isManual ? ["수기 청구서"] : reviewReasons(row, baseline)
  return (
    <span className="flex flex-wrap gap-1">
      {row.events.map((e) => (
        <ToneBadge key={e} tone="neutral">
          {e}
        </ToneBadge>
      ))}
      {reasons.map((r) => (
        <ToneBadge key={r} tone={r === "수기 청구서" ? "neutral" : "warning"} icon={r !== "수기 청구서"}>
          {r === "전기 0원" ? "전기 0원 — 계량기 연결·전기료 확인" : reviewReasonLabel(r, row, baseline)}
        </ToneBadge>
      ))}
      {row.correcting && <StatusBadge domain="bill" status="correcting" showDefaultDetail={false} />}
    </span>
  )
}

export function StepGenerate({
  status,
  today,
  mailEnabled,
  locked,
  step2Dirty,
  metersDirty,
  onGoStep,
  afterWrite,
  onPrev,
  onNext,
}: {
  status: CloseStatus
  today: string
  mailEnabled: boolean
  locked: boolean
  step2Dirty: boolean
  /** 1단계에 저장 안 한 검침이 있음 */
  metersDirty: boolean
  onGoStep: (n: 1 | 2 | 3 | 4) => void
  afterWrite: () => Promise<void>
  onPrev: () => void
  onNext: () => void
}) {
  const ask = useConfirm()
  const [view, setView] = useUrlState("view", "review")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerateResponse | null>(null)
  const [memoWarning, setMemoWarning] = useState<string | null>(null)
  const [preview, setPreview] = useState<ReviewRow | null>(null)

  const bm = status.billMonth
  const bmName = `${billMonthShort(bm, today)} 청구서`
  const regular = status.rows.filter((r) => !r.isManual)
  const baseline = monthBaselinePct(status.rows)
  const flagged = regular.filter((r) => needsReview(r, baseline))
  const shown = sortByChange(view === "all" ? status.rows : flagged)
  const total = regular.reduce((s, r) => s + r.total, 0)
  const drafts = regular.filter((r) => r.status === "draft").length
  const deltaPct = status.prevMonthTotal && status.prevMonthTotal > 0 && regular.length > 0 ? Math.round(((total - status.prevMonthTotal) / status.prevMonthTotal) * 1000) / 10 : null
  // 앞 단계 막힘 안내 하나: 1단계 미저장 > 2단계 미저장 > 2단계 검산 이상 > 2단계 미완료
  const step2Attention = status.steps[1].status === "attention"
  const block: { step: 1 | 2; title: string; body: string; canForce: boolean; tone: "danger" | "warning" } | null = metersDirty
    ? { step: 1, title: "1단계 검침이 저장되지 않았어요", body: "저장하지 않은 검침은 청구서에 들어가지 않아요. 1단계에서 저장한 뒤 다시 만들어 주세요.", canForce: false, tone: "danger" }
    : step2Dirty
      ? { step: 2, title: "2단계 값이 저장되지 않았어요", body: "저장하지 않은 2단계 값은 청구서에 들어가지 않아요. 2단계에서 저장한 뒤 다시 만들어 주세요.", canForce: false, tone: "danger" }
      : step2Attention
        ? { step: 2, title: "2단계 검산이 맞지 않아요", body: "10평당 단가와 한전 청구금액을 확인해 주세요. 그대로 만들면 전기료가 틀릴 수 있어요.", canForce: true, tone: "warning" }
        : status.steps[1].status !== "done"
          ? { step: 2, title: "2단계 전기료 배분이 끝나지 않았어요", body: "한전 청구금액·10평당 단가를 저장해야 전기료가 맞게 들어가요.", canForce: true, tone: "danger" }
          : null
  const alert = baselineAlert(baseline)

  // 정정 사유를 되돌린 청구서(issued_at 있는 draft, 정기)의 메모에 덧붙인다. 메모 PUT은 통째 교체라 상세 GET의 메모 + 새 줄
  const appendReason = async (reason: string) => {
    const list = await api<{ bills: { id: number; issued_at: string | null; is_manual: boolean }[] }>(`/api/admin/billing/bills?period=${bm}&status=draft`)
    if (!list.ok || !list.data) return 0
    const targets = list.data.bills.filter((b) => b.issued_at && !b.is_manual)
    let failed = 0
    for (const b of targets) {
      const detail = await api<{ bill: { memo: string | null } }>(`/api/admin/billing/bills?id=${b.id}`)
      if (!detail.ok || !detail.data) {
        failed++
        continue
      }
      const memo = appendBillMemo(detail.data.bill.memo, `정정 사유(${date(today)}): ${reason}`)
      const put = await api(`/api/admin/billing/bills`, { method: "PUT", json: { id: b.id, memo } })
      if (!put.ok) failed++
    }
    return failed
  }

  const askCorrection = async (n: number): Promise<{ ok: boolean; reason: string | null }> => {
    const box: { reason: string | null } = { reason: null }
    const r = await ask({
      title: `발행된 ${n}건을 고쳐서 다시 보낼까요?`,
      body: (
        <>
          지금 값으로 다시 계산하면 발행된 청구서 {n}건의 금액이 달라져요.
          <ReasonPicker onChange={(v) => (box.reason = v)} />
        </>
      ),
      consequences: [
        `되돌린 ${n}건은 다시 ‘작성 중’이 되고, 다시 발행할 때까지 받을 돈 목록에 ‘정정 중’으로 남아요`,
        mailEnabled ? "4단계에서 발행하면 제목에 [정정]이 붙어 다시 나가요" : "4단계에서 다시 발행해야 포털에 다시 보여요",
        "납부 완료·수기 청구서는 바뀌지 않아요",
      ],
      details: (
        <>
          <span className="block">· 내용이 실제로 달라지는 건만 되돌려요(금액이 같은 기업에는 정정이 나가지 않아요).</span>
          <span className="block">· 기존 청구서 PDF는 폐기되고, 4단계에서 다시 발행할 때 새로 만들어져요.</span>
          <span className="block">
            {mailEnabled ? "· 4단계 발행을 다시 눌러야 기업에 정정 청구서 메일이 나가요." : "· 메일 발송이 꺼져 있어 정정 청구서 PDF는 직접 전달해야 해요."}
          </span>
          <span className="block">· 되돌린 동안에는 입주기업 포털에서 해당 청구서가 보이지 않아요. 다시 발행하면 다시 보이니 이어서 진행해 주세요.</span>
        </>
      ),
      confirmLabel: `${n}건 되돌리고 다시 만들기`,
      cancelLabel: "그대로 두기",
    })
    return { ok: r === true, reason: box.reason }
  }

  const generate = async (opts: { force?: boolean; regenerateIssued?: boolean; reason?: string | null } = {}): Promise<void> => {
    setBusy(true)
    setError(null)
    setMemoWarning(null)
    const res = await api<GenerateResponse>("/api/admin/billing/bills/generate", {
      method: "POST",
      json: { billMonth: bm, ...(opts.force ? { force: true } : {}), ...(opts.regenerateIssued ? { regenerate_issued: true } : {}) },
    })
    setBusy(false)
    const d = res.data
    if (res.ok && d?.success) {
      setResult(d)
      if (opts.regenerateIssued && opts.reason && (d.reissued ?? 0) > 0) {
        const failed = await appendReason(opts.reason)
        if (failed > 0) setMemoWarning(`정정 사유를 ${failed}건에 남기지 못했어요. 청구서 화면에서 메모로 남겨 주세요.`)
      }
      await afterWrite()
      // 되돌리면 금액이 바뀌는 발행분이 있으면 그 자리에서 정정 대화상자를 연다
      if (!opts.regenerateIssued && (d.reissuable ?? 0) > 0) {
        const c = await askCorrection(d.reissuable!)
        if (c.ok) return generate({ ...opts, regenerateIssued: true, reason: c.reason })
        return
      }
      const made = (d.created ?? 0) + (d.regenerated ?? 0) + (d.reissued ?? 0)
      toastSuccess(made > 0 ? `${bmName} ${made}건을 만들었어요` : "다시 만들 청구서가 없었어요")
      return
    }
    if (d?.needs_force) {
      const metersMissing = status.meters.saved < status.meters.total
      const r = await ask({
        title: "전기료가 아직 계산되지 않았어요",
        body: metersMissing
          ? "검침 지침이 없는 계량기가 있어 공장동 전기료가 0원으로 계산돼요."
          : "한전 청구금액과 10평당 단가가 저장되지 않아 전기료가 0원으로 계산돼요.",
        consequences: ["이대로 만들면 전기료 0원 청구서가 생겨요", "전기료를 넣은 뒤 다시 만들면 고칠 수 있어요(발행 전까지)"],
        confirmLabel: "전기료 입력하러 가기",
        altAction: { label: "0원으로 진행", tone: "danger" },
      })
      if (r === true) onGoStep(metersMissing ? 1 : 2)
      else if (r === "alt") return generate({ ...opts, force: true })
      return
    }
    setError(friendlyError(res.status, res.error, "청구서를 만들지 못했어요."))
  }

  const onGenerate = async () => {
    if (block) {
      const r = await ask({
        title: block.title,
        body: block.body,
        confirmLabel: `${block.step}단계로 가기`,
        altAction: block.canForce ? { label: "그래도 만들기" } : undefined,
      })
      if (r === true) return onGoStep(block.step)
      if (r !== "alt") return
    }
    if (status.isOlderThanLatestIssued) {
      const ok = await ask({
        title: "지난 달 청구서를 다시 만들까요?",
        body: "청구서를 다시 만들면 지금 계약 기준으로 계산돼요. 그 뒤 입주한 기업도 들어갈 수 있어요.",
        confirmLabel: "지금 계약 기준으로 만들기",
      })
      if (!ok) return
    }
    await generate()
  }

  const issuedLocked = locked
  const viewOptions = [
    { value: "review", label: "확인 필요", count: flagged.length },
    { value: "all", label: "전체", count: status.rows.length },
  ]

  return (
    <div>
      {issuedLocked && (
        <Notice tone="info" className="mb-4">
          이 달은 발행됐어요. 값을 고치려면 1·2단계 위의 [정정 시작]을 먼저 눌러 주세요.
        </Notice>
      )}
      <div className="rounded-md border border-warm-tan bg-card">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-warm-tan px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-dark">3단계 · {bmName} 만들기</h2>
            <p className="mt-0.5 text-[15px] text-text-secondary [word-break:keep-all] lg:[@media(max-height:760px)]:hidden">만든 청구서는 ‘작성 중’이라 아직 포털에 보이지 않아요. 여러 번 눌러도 안전해요</p>
          </div>
          {!issuedLocked && regular.length > 0 && (
            <BusyButton type="button" variant="outline" className="hover:bg-warm-beige hover:text-dark" busy={busy} busyLabel="만드는 중…" onClick={onGenerate}>
              청구서 다시 만들기
            </BusyButton>
          )}
        </div>

        {block && !issuedLocked && (
          <div className="border-b border-warm-tan px-4 py-3 sm:px-5">
            <Notice
              tone={block.tone}
              title={block.title}
              action={
                <Button type="button" size="sm" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={() => onGoStep(block.step)}>
                  {block.step}단계로 가기
                </Button>
              }
            >
              {block.body}
            </Notice>
          </div>
        )}
        {error && (
          <div className="border-b border-warm-tan px-4 py-3 sm:px-5">
            <Notice tone="danger" title="청구서를 만들지 못했어요">
              {error}
            </Notice>
          </div>
        )}
        {result && (
          <div className="space-y-2 border-b border-warm-tan px-4 py-3 sm:px-5">
            <Notice tone="success" onClose={() => setResult(null)}>
              새로 {result.created ?? 0}건 · 다시 만듦 {result.regenerated ?? 0}건
              {(result.reissued ?? 0) > 0 && ` · 발행분 되돌려 다시 만듦 ${result.reissued}건`}
              {(result.removed ?? 0) > 0 && ` · 퇴실·공실 정리 ${result.removed}건`}
              {(result.skipped?.length ?? 0) > 0 && ` · 건너뜀 ${result.skipped!.length}건`}
              {(result.per10_billed != null || result.elec_sum != null) && (
                <p className="mt-0.5 text-[15px]">
                  {[
                    result.elec_sum != null ? `반영된 ${month(status.usageMonth)} 전기료 합계 ${won(result.elec_sum)}` : null,
                    result.per10_billed != null ? `적용한 10평당 전기 단가 ${won(result.per10_billed)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {(result.reissued ?? 0) > 0 && <p className="mt-0.5 text-[15px]">되돌린 {result.reissued}건은 4단계에서 다시 발행해야 포털에 보여요.</p>}
              {(result.skipped?.length ?? 0) > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[15px] underline underline-offset-2">건너뛴 기업 보기</summary>
                  <ul className="mt-1 list-disc pl-5 text-[15px]">
                    {result.skipped!.map((s, i) => (
                      <li key={i}>
                        {s.tenant_name}: {s.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </Notice>
            {(result.unmapped_metered?.length ?? 0) > 0 && (
              <Notice tone="warning" title="계량기에 연결되지 않은 호실이 있어 전기료가 0원으로 들어갔어요">
                {result.unmapped_metered!.join(", ")} — 기준 정보에서 계약의 호실·전기 방식을 확인해 주세요.
              </Notice>
            )}
            {(result.reissuable ?? 0) > 0 && (
              <Notice
                tone="warning"
                title={`발행된 ${result.reissuable}건에 최신 값이 반영되지 않았어요`}
                action={
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="hover:bg-warm-beige hover:text-dark"
                    onClick={async () => {
                      const c = await askCorrection(result.reissuable!)
                      if (c.ok) await generate({ regenerateIssued: true, reason: c.reason })
                    }}
                  >
                    발행된 {result.reissuable}건 되돌려 다시 만들기
                  </Button>
                }
              >
                {(result.reissuable_elec_diff ?? 0) !== 0 ? `되돌려 다시 만들면 전기료 ${won(result.reissuable_elec_diff)}이 더 반영돼요. ` : "되돌려 다시 만들면 금액이 달라져요. "}
                그 뒤 4단계에서 다시 발행해야 정정 청구서가 나가요.
              </Notice>
            )}
            {memoWarning && <Notice tone="warning">{memoWarning}</Notice>}
          </div>
        )}

        {/* 요약 4칸 */}
        <dl className="grid grid-cols-2 gap-px border-b border-warm-tan bg-warm-tan sm:grid-cols-4">
          {[
            { label: drafts > 0 ? "작성 중" : "청구서", value: `${drafts > 0 ? drafts : regular.length}건` },
            { label: "합계", value: <Money value={total} /> },
            { label: "지난달보다", value: deltaPct === null ? "비교할 달 없음" : `${deltaPct > 0 ? "+" : deltaPct < 0 ? "−" : ""}${Math.abs(deltaPct)}%` },
            { label: "확인 필요", value: `${flagged.length}건` },
          ].map((c) => (
            <div key={c.label} className="bg-card px-4 py-2.5 lg:[@media(max-height:760px)]:flex lg:[@media(max-height:760px)]:items-baseline lg:[@media(max-height:760px)]:gap-2 lg:[@media(max-height:760px)]:py-1.5">
              <dt className="text-sm text-[#3f3f4e]">{c.label}</dt>
              <dd className="text-lg font-semibold tabular-nums text-dark lg:[@media(max-height:760px)]:text-base">{c.value}</dd>
            </div>
          ))}
        </dl>

        {alert && status.rows.length > 0 && (
          <div className="border-b border-warm-tan px-4 py-3 sm:px-5">
            <Notice tone="warning" title="확인 필요">
              {alert}
            </Notice>
          </div>
        )}

        {status.rows.length === 0 ? (
          <EmptyState
            kind="first-use"
            title="아직 만든 청구서가 없어요"
            description="1·2단계를 마친 뒤 [청구서 만들기]를 눌러 주세요"
            compact
          />
        ) : (
          <div className="px-4 py-3 sm:px-5">
            <FilterTabs label="청구서 보기" value={view === "all" ? "all" : "review"} onValueChange={setView} options={viewOptions} className="mb-3" />
            {shown.length === 0 ? (
              <EmptyState
                kind="no-results"
                title="확인할 청구서가 없어요"
                description="지난달보다 크게 달라진 곳·신규·0원·전기 0원이 없어요"
                onClear={() => setView("all")}
                compact
              />
            ) : (
              <>
                <table className="hidden w-full text-[15px] md:table">
                  <caption className="sr-only">{bmName} 지난달 대비</caption>
                  <thead className="bg-warm-ivory text-left text-sm text-[#3f3f4e]">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">기업</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">지난달(원)</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">이번 달(원)</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">증감</th>
                      <th scope="col" className="px-3 py-2 font-medium">사유</th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        <span className="sr-only">미리보기</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.billId} className="border-t border-warm-tan/70">
                        <th scope="row" className="px-3 py-2.5 text-left font-medium text-dark">{r.tenantName}</th>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[#3f3f4e]">{r.prevTotal === null ? "-" : wonNum(r.prevTotal)}</td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums text-dark">{wonNum(r.total)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-dark">{changeText(r)}</td>
                        <td className="px-3 py-2.5">
                          <ReasonBadges row={r} baseline={baseline} />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <Button type="button" variant="ghost" size="sm" className="text-dark hover:bg-warm-beige" onClick={() => setPreview(r)} aria-label={`${r.tenantName} ${bmName} 미리보기`}>
                            <FileText aria-hidden />
                            미리보기
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="divide-y divide-warm-tan/70 md:hidden">
                  {shown.map((r) => (
                    <li key={r.billId} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 font-medium text-dark [word-break:keep-all]">{r.tenantName}</p>
                        <p className="shrink-0 text-right font-semibold tabular-nums text-dark">{won(r.total)}</p>
                      </div>
                      <p className="mt-0.5 text-sm tabular-nums text-[#3f3f4e]">
                        지난달 {r.prevTotal === null ? "-" : won(r.prevTotal)} · {changeText(r)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                        <ReasonBadges row={r} baseline={baseline} />
                        <Button type="button" variant="outline" size="sm" className="hover:bg-warm-beige hover:text-dark" onClick={() => setPreview(r)} aria-label={`${r.tenantName} ${bmName} 미리보기`}>
                          <FileText aria-hidden />
                          미리보기
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="mt-2 text-sm text-text-secondary [word-break:keep-all]">
              ‘확인 필요’ 기준: 이번 달 보통 변동({baseline > 0 ? "+" : baseline < 0 ? "−" : ""}{Math.abs(baseline)}%)을 빼고도 10% 또는 5만 원 넘게 달라진 곳, 신규, 0원, 전기 0원
            </p>
          </div>
        )}
      </div>

      <StepHelp notes={BILLING_CLOSE_STEP_NOTES.generate} className="mt-4" />

      <PdfPreviewSheet
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        url={preview ? `/api/admin/billing/bills/preview?id=${preview.billId}` : null}
        title={preview ? `${preview.tenantName} ${bmName} 미리보기` : "청구서 미리보기"}
      />

      <StickyActionBar
        summary={<span className="max-sm:hidden">{regular.length > 0 ? `${bmName} ${regular.length}건 · 확인 필요 ${flagged.length}건` : "아직 만든 청구서가 없어요"}</span>}
        secondary={
          <Button type="button" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={onPrev}>
            이전
          </Button>
        }
        primary={
          regular.length === 0 && !issuedLocked ? (
            <BusyButton type="button" busy={busy} busyLabel="만드는 중…" onClick={onGenerate}>
              청구서 만들기
            </BusyButton>
          ) : (
            <Button type="button" onClick={onNext}>
              다음: 발행 확인
              <ChevronRight aria-hidden />
            </Button>
          )
        }
      />
    </div>
  )
}
