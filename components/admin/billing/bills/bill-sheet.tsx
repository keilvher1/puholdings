"use client"

// 청구서 상세 — 오른쪽 시트(휴대폰은 전체 화면), ?bill=ID로 열린다(계획서 4.4.7 B-4).
// 머리: "(주)솔바람테크 · 2026년 8월분" + 배지(billBadge 날짜 판정). 요약 4칸(청구 금액·납부 기한·발행일·받는 메일).
// 지난달 같은 기업 청구서와 비교 한 줄. 항목은 describeBillLine.
// 작성 중이면 조정(manual) 라인만 추가·수정·삭제한다(생성 라인은 읽기 전용 — 재생성이 덮어쓴다, 가드 #20).
// PUT lines는 라인 전체 교체라 생성 라인 그대로 + 바뀐 조정 라인을 보내고, 합계는 저장 뒤 다시 읽은 서버 값으로 그린다.
// 상태별 주 버튼 1개: 작성 중 수기 = [이 청구서만 발행] / 작성 중 정기 = "월 마감 4단계에서 발행해요 ›" / 납부 대기·기한 지남 = [납부 처리] / 납부 완료 = 없음.

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ChevronRight, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  BusyButton,
  CardSkeleton,
  DetailSheet,
  EmptyState,
  Money,
  Notice,
  RowActions,
  StatusBadge,
  ToneBadge,
  WonInput,
  toastSuccess,
  useConfirm,
  type RowActionItem,
} from "@/components/saas"
import { describeBillLine } from "@/lib/bill-display"
import { addMonths, billMonth, billMonthShort, dateShort, due as dueText, todayKST, won } from "@/lib/format"
import { billingCloseHrefForBillMonth, tenantsHref } from "@/lib/links"
import { MSG } from "@/lib/messages"
import {
  badgeOf,
  buildLinesPayload,
  canEditManualLines,
  manualEditsDirty,
  manualEditsFrom,
  prevMonthComparison,
  sheetActions,
  stateOf,
  type BillLine,
  type BillRow,
  type ManualLineEdit,
} from "./bill-model"
import { fetchBill, fetchTenantBills, issueOne, markUnpaid, saveDueDate, saveLines, saveMemo, type BillDetail } from "./bills-api"

let keySeq = 0
const newKey = () => `new-${++keySeq}`

export function BillSheet({
  billId,
  onClose,
  onPay,
  onGuide,
  onChanged,
  mailEnabled,
  refreshKey = 0,
  openNotice = null,
  onOpenNoticeShown,
}: {
  billId: number | null
  /** 이 청구서를 열 때 먼저 보일 안내(예: 추가 청구에서 저장 뒤 발행 실패). billId가 같을 때만 보인다 */
  openNotice?: { billId: number; title: string; text: string } | null
  onOpenNoticeShown?: () => void
  /** 바뀌면 열린 청구서를 다시 읽는다(시트 밖에서 납부 처리·되돌리기 했을 때) */
  refreshKey?: number
  onClose: () => void
  /** [납부 처리] — 부르는 쪽의 납부 대화상자를 이 건으로 연다 */
  onPay: (row: BillRow) => void
  /** 납부 안내 문구 — 그 기업의 받을 돈 전체로 */
  onGuide: (row: BillRow) => void
  /** 쓰기 뒤 목록 다시 읽기 */
  onChanged: () => void
  mailEnabled: boolean
}) {
  const ask = useConfirm()
  const today = todayKST()
  const [detail, setDetail] = useState<BillDetail | null>(null)
  const [prev, setPrev] = useState<BillRow | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [edits, setEdits] = useState<ManualLineEdit[]>([])
  const [lineErrors, setLineErrors] = useState<Record<string, { label?: string; amount?: string }>>({})
  const [busy, setBusy] = useState<null | "lines" | "issue" | "due" | "memo" | "unpay">(null)
  const [notice, setNotice] = useState<{ tone: "danger" | "warning" | "success"; title?: string; text: string; link?: { label: string; href: string } } | null>(null)
  const [editDue, setEditDue] = useState(false)
  const [dueValue, setDueValue] = useState("")
  const [editMemo, setEditMemo] = useState(false)
  const [memoValue, setMemoValue] = useState("")
  const [dueError, setDueError] = useState<string | null>(null)
  // 마지막 요청만 반영한다(청구서를 빠르게 바꿔 열면 앞 응답이 늦게 와서 덮지 않게)
  const reqSeq = useRef(0)
  const openNoticeRef = useRef(openNotice)
  const shownRef = useRef(onOpenNoticeShown)
  // 아래 billId 효과보다 먼저 선언해 같은 렌더에서 먼저 맞춘다
  useEffect(() => {
    openNoticeRef.current = openNotice
    shownRef.current = onOpenNoticeShown
  })

  const load = useCallback(async (id: number, { keepNotice = false } = {}) => {
    const seq = ++reqSeq.current
    setLoading(true)
    setLoadError(null)
    if (!keepNotice) setNotice(null)
    const r = await fetchBill(id)
    if (seq !== reqSeq.current) return
    setLoading(false)
    if (!r.ok) {
      setLoadError(r.error)
      setDetail(null)
      return
    }
    setDetail(r.data)
    setEdits(manualEditsFrom(r.data.lines))
    setLineErrors({})
    const pending = openNoticeRef.current
    if (pending && pending.billId === id) {
      setNotice({ tone: "warning", title: pending.title, text: pending.text })
      shownRef.current?.()
    }
    // 지난달 같은 기업 청구서(비교 한 줄) — 실패해도 시트는 그대로
    const p = await fetchTenantBills(r.data.bill.tenant_id, addMonths(r.data.bill.period, -1))
    if (seq !== reqSeq.current) return
    setPrev(p.ok ? (p.data[0] ?? null) : null)
  }, [])

  useEffect(() => {
    setDetail(null)
    setPrev(null)
    setEditDue(false)
    setEditMemo(false)
    setDueError(null)
    if (billId) void load(billId)
    else reqSeq.current++
  }, [billId, load])

  useEffect(() => {
    if (billId && refreshKey > 0) void load(billId, { keepNotice: true })
    // billId 변경은 위 효과가 맡는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const bill = detail?.bill ?? null
  const lines = detail?.lines ?? []
  const dirty = !!bill && canEditManualLines(bill) && manualEditsDirty(lines, edits)
  const acts = bill ? sheetActions(bill, today) : null
  const name = bill ? `${bill.tenant_name} ${billMonthShort(bill.period, today)}` : ""

  const afterWrite = async () => {
    if (billId) await load(billId, { keepNotice: true })
    onChanged()
  }

  // ── 조정 라인 저장(라인 전체 교체) ──
  const saveManual = async () => {
    if (!bill) return
    const body = buildLinesPayload(lines, edits)
    setLineErrors(body.errors)
    if (Object.keys(body.errors).length > 0) {
      const first = Object.keys(body.errors)[0]
      requestAnimationFrame(() => document.getElementById(`ml-${first}-${body.errors[first].label ? "label" : "amount"}`)?.focus())
      return
    }
    if (body.lines.length === 0) {
      setNotice({ tone: "danger", text: "항목이 하나도 없으면 저장할 수 없어요. 조정 항목을 남기거나 하나 더해 주세요." })
      return
    }
    setBusy("lines")
    const r = await saveLines(bill.id, body.lines)
    setBusy(null)
    if (!r.ok) {
      setNotice({ tone: "danger", title: "조정 항목을 저장하지 못했어요", text: r.error })
      return
    }
    toastSuccess(`${name} 조정 항목을 저장했어요`)
    await afterWrite()
  }

  // ── 수기 청구서 한 건 발행 ──
  const issue = async () => {
    if (!bill) return
    if (dirty) {
      setNotice({ tone: "warning", text: "고친 조정 항목을 먼저 저장해 주세요." })
      return
    }
    const email = bill.tax_email || bill.contact_email || null
    const ok = await ask({
      title: `${name} 수기 청구서를 발행할까요?`,
      body: "발행하면 입주기업 포털에 보이고 받을 돈에 들어가요.",
      summary: [
        { label: "기업", value: bill.tenant_name },
        { label: "청구월", value: billMonth(bill.period) },
        { label: "금액", value: won(bill.total_amount) },
        { label: "받는 메일", value: mailEnabled ? (email ?? "없음(메일이 나가지 않아요)") : "메일 발송이 꺼져 있어요" },
      ],
      consequences: [
        mailEnabled ? (email ? "PDF가 붙은 발행 메일이 가요" : "받는 메일이 없어 메일은 나가지 않아요") : MSG.mailOff,
        "잘못 발행했다면 월 마감에서 정정해야 해요",
      ],
      confirmLabel: "이 청구서만 발행하기",
    })
    if (!ok) return
    setBusy("issue")
    const r = await issueOne(bill.id)
    setBusy(null)
    if (!r.ok) {
      if (r.body?.needs_regenerate || r.body?.needs_force) {
        setNotice({
          tone: "warning",
          title: "발행하지 않았어요",
          text: "전기료가 0원으로 들어간 항목이 있어요. 월 마감에서 처리해 주세요.",
          link: { label: "월 마감 열기", href: billingCloseHrefForBillMonth(bill.period, 3) },
        })
      } else {
        setNotice({ tone: "danger", title: "발행하지 못했어요", text: `${r.error} 목록을 다시 불러왔어요.` })
      }
      await afterWrite()
      return
    }
    const mailNote = !mailEnabled ? "메일은 나가지 않았어요(메일 발송 꺼짐)" : r.data.mail.sent > 0 ? "발행 메일을 보냈어요" : r.data.no_email.length > 0 ? "받는 메일이 없어 메일은 나가지 않았어요" : r.data.mail.failed > 0 ? "발행 메일은 보내지 못했어요. 메일 화면에서 확인해 주세요" : undefined
    toastSuccess(r.data.issued > 0 ? `${name} 청구서를 발행했어요` : "이미 발행된 청구서예요", { description: mailNote })
    await afterWrite()
  }

  // ── 납부 처리 취소 ──
  const unpay = async () => {
    if (!bill) return
    const paid = bill.paid_at ? dateShort(bill.paid_at, today) : null
    const ok = await ask({
      title: `${name}을 납부 대기로 되돌릴까요?`,
      body: paid ? `납부일 ${paid} 기록이 지워져요.` : "납부 기록이 지워져요.",
      consequences: ["메모에 납부 취소 기록이 남아요", "다시 입금을 확인하면 [납부 처리]로 바꾸면 돼요"],
      confirmLabel: "납부 대기로 되돌리기",
      tone: "danger",
    })
    if (!ok) return
    setBusy("unpay")
    const r = await markUnpaid(bill.id)
    setBusy(null)
    if (!r.ok) {
      setNotice({ tone: "danger", title: "되돌리지 못했어요", text: r.error })
      return
    }
    toastSuccess(`${name}을 납부 대기로 되돌렸어요`)
    await afterWrite()
  }

  const saveDue = async () => {
    if (!bill) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueValue)) {
      setDueError("납부 기한을 골라 주세요")
      requestAnimationFrame(() => document.getElementById("bill-due")?.focus())
      return
    }
    setDueError(null)
    setBusy("due")
    const r = await saveDueDate(bill.id, dueValue)
    setBusy(null)
    if (!r.ok) {
      setNotice({ tone: "danger", title: "납부 기한을 저장하지 못했어요", text: r.error })
      return
    }
    setEditDue(false)
    toastSuccess(`납부 기한을 ${dateShort(dueValue, today)}로 바꿨어요`)
    await afterWrite()
  }

  const saveMemoNow = async () => {
    if (!bill) return
    setBusy("memo")
    const r = await saveMemo(bill.id, memoValue)
    setBusy(null)
    if (!r.ok) {
      setNotice({ tone: "danger", title: "메모를 저장하지 못했어요", text: r.error })
      return
    }
    setEditMemo(false)
    toastSuccess("메모를 저장했어요")
    await afterWrite()
  }

  const moreItems: RowActionItem[] = []
  if (bill && acts) {
    if (acts.more.includes("pdf")) moreItems.push({ label: "PDF 미리보기(새 창)", onSelect: () => window.open(`/api/admin/billing/bills/preview?id=${bill.id}`, "_blank", "noopener") })
    if (acts.more.includes("due")) moreItems.push({ label: "납부 기한 바꾸기", onSelect: () => { setDueValue(bill.due_date ?? ""); setDueError(null); setEditDue(true) } })
    if (acts.more.includes("memo")) moreItems.push({ label: "메모 고치기", onSelect: () => { setMemoValue(bill.memo ?? ""); setEditMemo(true) } })
    if (acts.more.includes("guide")) moreItems.push({ label: "납부 안내 문구 복사", onSelect: () => onGuide(bill) })
    if (acts.more.includes("unpay")) moreItems.push({ label: "납부 처리 취소", onSelect: () => void unpay(), danger: true })
  }

  const b = bill ? badgeOf(bill, today) : null
  const email = bill ? bill.tax_email || bill.contact_email || null : null
  const comparison = bill ? prevMonthComparison(bill, prev) : null
  const correcting = bill ? stateOf(bill, today).kind === "correcting" : false
  const editable = !!bill && canEditManualLines(bill)
  const generated = lines.filter((l) => l.line_type !== "manual")
  const manualRead = lines.filter((l) => l.line_type === "manual")

  const footer = bill && acts && (
    <>
      {acts.closeLink && (
        <Link href={billingCloseHrefForBillMonth(bill.period, 4)} className="mr-auto inline-flex min-h-9 items-center gap-1 text-[15px] text-link underline underline-offset-2">
          월 마감 4단계에서 발행해요
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      )}
      {moreItems.length > 0 && <RowActions label={name} items={moreItems} />}
      {acts.primary === "issue_single" && (
        <BusyButton type="button" busy={busy === "issue"} busyLabel="발행 중…" onClick={issue}>
          이 청구서만 발행
        </BusyButton>
      )}
      {acts.primary === "pay" && (
        <Button type="button" onClick={() => onPay(bill)}>
          납부 처리
        </Button>
      )}
    </>
  )

  return (
    <DetailSheet
      open={billId !== null}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
      title={bill ? `${bill.tenant_name} · ${billMonth(bill.period)}` : "청구서"}
      badge={b ? <StatusBadge domain="bill" status={b.status} detail={b.detail} showDefaultDetail={false} /> : undefined}
      highlights={
        bill
          ? [
              { label: "청구 금액", value: <Money value={bill.total_amount} strong /> },
              { label: "납부 기한", value: bill.due_date ? dateShort(bill.due_date, today) : "기한 없음" },
              { label: bill.status === "paid" ? "납부일" : "발행일", value: bill.status === "paid" ? (bill.paid_at ? dateShort(bill.paid_at, today) : "-") : bill.issued_at && bill.status !== "draft" ? dateShort(bill.issued_at, today) : correcting ? "다시 발행 전" : "발행 전" },
              {
                label: "받는 메일",
                value: (
                  <span className="flex flex-wrap items-baseline gap-x-2 text-[15px] font-normal">
                    {/* 좁은 칸에서는 @ 앞에서 먼저 줄을 바꾸고(단어 중간에서 끊지 않게), 그래도 길면 그때만 아무 곳에서나 */}
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      {email ? (
                        <>
                          {email.slice(0, Math.max(0, email.indexOf("@")))}
                          <wbr />
                          {email.slice(Math.max(0, email.indexOf("@")))}
                        </>
                      ) : (
                        "없음"
                      )}
                    </span>
                    <Link href={tenantsHref({ tenant: bill.tenant_id, card: "contact" })} className="whitespace-nowrap text-sm text-link underline underline-offset-2">
                      변경
                    </Link>
                  </span>
                ),
              },
            ]
          : undefined
      }
      dirty={dirty}
      footer={footer}
      size="lg"
    >
      {loading && !bill ? (
        <CardSkeleton lines={6} label="청구서를 불러오는 중…" />
      ) : loadError ? (
        <EmptyState kind="error" title="청구서를 불러오지 못했어요" description={loadError} onRetry={() => billId && load(billId)} compact />
      ) : bill ? (
        <div className="space-y-5">
          {notice && (
            <Notice tone={notice.tone} title={notice.title} onClose={() => setNotice(null)}>
              {notice.text}
              {notice.link && (
                <>
                  {" "}
                  <Link href={notice.link.href} className="text-link underline underline-offset-2">
                    {notice.link.label}
                  </Link>
                </>
              )}
            </Notice>
          )}
          {correcting && (
            <Notice tone="warning" title="정정 중이에요">
              발행했다가 되돌린 청구서예요. 다시 발행해야 포털에 보여요.{" "}
              <Link href={billingCloseHrefForBillMonth(bill.period, 4)} className="text-link underline underline-offset-2">
                월 마감 4단계 열기
              </Link>
            </Notice>
          )}
          {comparison && <p className="text-[15px] text-[#3f3f4e] [word-break:keep-all]">{comparison}</p>}

          <section aria-labelledby="bill-lines-title">
            <h3 id="bill-lines-title" className="mb-2 text-base font-semibold text-dark">
              항목
            </h3>
            <ul className="divide-y divide-warm-tan rounded-md border border-warm-tan">
              {generated.map((l, i) => (
                <LineRow key={l.id ?? `g-${i}`} line={l} lines={lines} />
              ))}
              {!editable &&
                manualRead.map((l, i) => <LineRow key={l.id ?? `m-${i}`} line={l} lines={lines} />)}
              {editable &&
                edits.map((e) => (
                  <li key={e.key} className="flex flex-wrap items-start gap-2 px-3 py-2.5">
                    <ToneBadge tone="neutral" icon={false}>
                      조정
                    </ToneBadge>
                    <div className="min-w-0 flex-1 basis-40">
                      <Label htmlFor={`ml-${e.key}-label`} className="sr-only">
                        조정 항목 이름
                      </Label>
                      <Input
                        id={`ml-${e.key}-label`}
                        value={e.label}
                        placeholder="예: 8월 과오납분 차감"
                        onChange={(ev) => setEdits((p) => p.map((x) => (x.key === e.key ? { ...x, label: ev.target.value } : x)))}
                        aria-invalid={lineErrors[e.key]?.label ? true : undefined}
                        aria-describedby={lineErrors[e.key]?.label ? `ml-${e.key}-label-err` : undefined}
                        className="h-9 text-[15px]"
                      />
                      {lineErrors[e.key]?.label && (
                        <p id={`ml-${e.key}-label-err`} className="mt-1 text-sm text-red-800">
                          {lineErrors[e.key]?.label}
                        </p>
                      )}
                    </div>
                    <div className="w-40">
                      <Label htmlFor={`ml-${e.key}-amount`} className="sr-only">
                        {e.label || "조정 항목"} 금액
                      </Label>
                      <WonInput
                        id={`ml-${e.key}-amount`}
                        value={e.amount}
                        allowNegative
                        invalid={!!lineErrors[e.key]?.amount}
                        onChange={(v) => setEdits((p) => p.map((x) => (x.key === e.key ? { ...x, amount: v } : x)))}
                        aria-describedby={lineErrors[e.key]?.amount ? `ml-${e.key}-amount-err` : "ml-amount-hint"}
                      />
                      {lineErrors[e.key]?.amount && (
                        <p id={`ml-${e.key}-amount-err`} className="mt-1 text-sm text-red-800">
                          {lineErrors[e.key]?.amount}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-[#3f3f4e] hover:bg-warm-beige hover:text-red-800"
                      aria-label={`${e.label || "조정"} 항목 삭제`}
                      onClick={() => setEdits((p) => p.filter((x) => x.key !== e.key))}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </li>
                ))}
              <li className="flex items-center justify-between gap-3 bg-warm-ivory px-3 py-2.5">
                <span className="font-semibold text-dark">합계</span>
                <Money value={bill.total_amount} strong />
              </li>
            </ul>
            {Number(bill.supply_amount ?? 0) > 0 && (
              <p className="mt-1.5 text-sm text-[#3f3f4e]">
                임대료·관리비 공급가액 {won(bill.supply_amount)} · 부가세 {won(bill.vat_amount)}
              </p>
            )}
            {editable && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="hover:bg-warm-beige hover:text-dark"
                    onClick={() => setEdits((p) => [...p, { key: newKey(), label: "", amount: null }])}
                  >
                    <Plus aria-hidden />
                    조정 항목 추가
                  </Button>
                  {dirty && (
                    <>
                      <BusyButton type="button" size="sm" busy={busy === "lines"} onClick={saveManual}>
                        조정 항목 저장
                      </BusyButton>
                      <Button type="button" variant="ghost" size="sm" className="hover:bg-warm-beige" onClick={() => { setEdits(manualEditsFrom(lines)); setLineErrors({}) }}>
                        고친 것 되돌리기
                      </Button>
                    </>
                  )}
                </div>
                <p id="ml-amount-hint" className="text-sm text-[#3f3f4e] [word-break:keep-all]">
                  조정 항목은 차감이면 앞에 −(빼기)를 붙여요. 합계는 저장하면 서버가 다시 계산해요.
                </p>
                {generated.length > 0 && (
                  <p className="text-sm text-[#3f3f4e] [word-break:keep-all]">
                    임대료·관리비·전기료는 여기서 고치지 않아요. 계약·단가를 고친 뒤 월 마감 3단계에서 다시 만들면 이 값으로 바뀌어요.{" "}
                    <Link href={billingCloseHrefForBillMonth(bill.period, 3)} className="whitespace-nowrap text-link underline underline-offset-2">
                      월 마감 3단계 열기
                    </Link>
                  </p>
                )}
              </div>
            )}
          </section>

          {editDue && (
            <section aria-labelledby="bill-due-title" className="rounded-md border border-warm-tan p-3">
              <h3 id="bill-due-title" className="text-base font-semibold text-dark">
                납부 기한 바꾸기
              </h3>
              {acts?.dueWarning && <p className="mt-1 text-sm text-amber-800">{acts.dueWarning}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Label htmlFor="bill-due" className="sr-only">
                  새 납부 기한
                </Label>
                <Input
                  id="bill-due"
                  type="date"
                  value={dueValue}
                  onChange={(e) => {
                    setDueValue(e.target.value)
                    setDueError(null)
                  }}
                  aria-invalid={dueError ? true : undefined}
                  aria-describedby={dueError ? "bill-due-err" : undefined}
                  className="h-9 w-44 text-[15px]"
                />
                <BusyButton type="button" size="sm" busy={busy === "due"} onClick={saveDue}>
                  납부 기한 저장
                </BusyButton>
                <Button type="button" variant="ghost" size="sm" className="hover:bg-warm-beige" onClick={() => setEditDue(false)}>
                  닫기
                </Button>
              </div>
              {dueError && (
                <p id="bill-due-err" className="mt-1 text-sm text-red-800">
                  {dueError}
                </p>
              )}
              <p className="mt-1.5 text-sm text-[#3f3f4e]">지금: {bill.due_date ? dueText(bill.due_date, today) : "납부 기한 없음"}</p>
            </section>
          )}

          <section aria-labelledby="bill-memo-title">
            <h3 id="bill-memo-title" className="mb-1.5 text-base font-semibold text-dark">
              메모
            </h3>
            {editMemo ? (
              <div className="space-y-2">
                <Label htmlFor="bill-memo" className="sr-only">
                  메모
                </Label>
                <Textarea id="bill-memo" value={memoValue} onChange={(e) => setMemoValue(e.target.value)} rows={4} className="text-[15px]" />
                <div className="flex gap-2">
                  <BusyButton type="button" size="sm" busy={busy === "memo"} onClick={saveMemoNow}>
                    메모 저장
                  </BusyButton>
                  <Button type="button" variant="ghost" size="sm" className="hover:bg-warm-beige" onClick={() => setEditMemo(false)}>
                    닫기
                  </Button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-line text-[15px] text-[#3f3f4e] [word-break:keep-all]">{bill.memo?.trim() ? bill.memo : "메모가 없어요"}</p>
            )}
          </section>

          <p className="text-sm text-[#3f3f4e]">
            {bill.is_manual ? "수기 청구서예요(추가 청구로 만든 것)" : "정기 청구서예요(월 마감에서 만든 것)"}
            {bill.issued_at && bill.status !== "draft" ? ` · 발행 ${dateShort(bill.issued_at, today)}` : ""}
          </p>
        </div>
      ) : null}
    </DetailSheet>
  )
}

function LineRow({ line, lines }: { line: BillLine; lines: BillLine[] }) {
  const d = describeBillLine(line, lines)
  return (
    <li className="flex items-start justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-[15px] text-dark [word-break:keep-all]">
          {line.line_type === "manual" && (
            <ToneBadge tone="neutral" icon={false}>
              조정
            </ToneBadge>
          )}
          {d.label}
        </p>
        {d.description && line.line_type !== "manual" && <p className="mt-0.5 text-sm text-[#3f3f4e]">{d.description}</p>}
        {d.formula && (
          <details className="mt-0.5 text-sm text-[#3f3f4e]">
            <summary className="cursor-pointer text-link underline underline-offset-2">계산 보기</summary>
            <p className="mt-1">{d.formula}</p>
          </details>
        )}
      </div>
      <Money value={line.amount} className="shrink-0 text-[15px]" />
    </li>
  )
}
