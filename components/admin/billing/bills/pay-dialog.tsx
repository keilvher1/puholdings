"use client"

// 납부 처리 대화상자(일괄·1건 공용, 계획서 4.4.7 B-3).
// 선택 건 표(행마다 포함 해제 가능) + "모두 같은 날짜"(기본값 없음, [오늘]) + 행별 입금일 + 메모(선택).
// 요청 순서(가드 #27): 건마다 ① mark_paid PUT(이체일) → ② 메모가 있으면 상세 GET으로 지금 메모를 읽어 appendBillMemo로 합친 memo PUT.
// 이체일이 빈 건은 보내지 않는다(서버는 빈 이체일을 조용히 오늘로 기록하므로). 실패한 건은 대화상자 안에 기업명과 이유를 남기고,
// 실패 뒤에는 그 건의 실제 상태를 다시 읽어 이미 바뀐 건은 완료로 센다(같은 버튼을 다시 눌러 두 번 처리하지 않게 남은 건만 다시 한다).

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BusyButton, ErrorSummary, Money, Notice, type FieldErrorItem } from "@/components/saas"
import { billMonthShort, dateShort, todayKST, won } from "@/lib/format"
import { cn } from "@/lib/utils"
import { checkPayItems, payMemoLine, type BillRow, type PayItem } from "./bill-model"
import { appendMemo, fetchBill, markPaid } from "./bills-api"

export interface PayOutcome {
  paid: BillRow[]
}

export function PayDialog({
  open,
  onOpenChange,
  rows,
  onPaid,
  onReload,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rows: BillRow[]
  /** 납부 완료로 바뀐 건(토스트·되돌리기·목록 갱신은 부르는 쪽) */
  onPaid: (paid: BillRow[], opts: { closed: boolean }) => void
  /** 실패 뒤 목록 다시 읽기 */
  onReload: () => void
}) {
  // 열 때마다 새로 시작(렌더 중 상태 맞추기 — 효과로 하지 않는다)
  const [prevOpen, setPrevOpen] = useState(false)
  const [items, setItems] = useState<PayItem[]>([])
  const [common, setCommon] = useState("")
  const [memo, setMemo] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Set<number>>(new Set())
  const [failures, setFailures] = useState<{ id: number; name: string; error: string }[]>([])
  const [memoFailed, setMemoFailed] = useState<string[]>([])
  const [errors, setErrors] = useState<FieldErrorItem[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setItems(rows.map((r) => ({ id: r.id, include: true, date: "" })))
      setCommon("")
      setMemo("")
      setDone(new Set())
      setFailures([])
      setMemoFailed([])
      setErrors([])
      setFormError(null)
    }
  }

  const today = todayKST()
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])
  const pending = items.filter((it) => !done.has(it.id))
  const included = pending.filter((it) => it.include)
  const includedSum = included.reduce((s, it) => s + Number(byId.get(it.id)?.total_amount ?? 0), 0)
  const check = checkPayItems(pending, rows, today)
  const nameOf = (id: number) => {
    const r = byId.get(id)
    return r ? `${r.tenant_name} ${billMonthShort(r.period, today)}` : `청구서 ${id}`
  }

  const setAll = (d: string) => {
    setCommon(d)
    setItems((prev) => prev.map((it) => (done.has(it.id) ? it : { ...it, date: d })))
    setErrors([])
  }

  const submit = async () => {
    setFormError(null)
    if (included.length === 0) {
      setFormError("납부 완료로 바꿀 청구서를 하나 이상 골라 주세요.")
      return
    }
    const errs: FieldErrorItem[] = [
      ...check.missingDate.map((id) => ({ field: `pay-${id}`, label: `${nameOf(id)} 입금일`, message: "입금일을 골라 주세요" })),
      ...check.invalidDate.map((id) => ({ field: `pay-${id}`, label: `${nameOf(id)} 입금일`, message: "날짜 형식이 맞지 않아요" })),
    ]
    setErrors(errs)
    if (errs.length > 0) {
      requestAnimationFrame(() => document.getElementById(`f-${errs[0].field}`)?.focus())
      return
    }
    setBusy(true)
    const paidNow: BillRow[] = []
    const fails: { id: number; name: string; error: string }[] = []
    const memoFails: string[] = []
    try {
      for (const it of check.ready) {
        const row = byId.get(it.id)!
        const r = await markPaid(it.id, it.paid_at)
        let ok = r.ok
        if (!r.ok) {
          // 실패·시간 초과 뒤에는 실제로 바뀌었는지 다시 읽는다
          const again = await fetchBill(it.id)
          if (again.ok && again.data.bill.status === "paid") ok = true
          else fails.push({ id: it.id, name: nameOf(it.id), error: r.error })
        }
        if (!ok) continue
        paidNow.push(row)
        const line = payMemoLine(it.paid_at, memo)
        if (line) {
          const m = await appendMemo(it.id, line)
          if (!m.ok) memoFails.push(nameOf(it.id))
        }
      }
    } finally {
      setBusy(false)
    }
    const allDone = fails.length === 0 && memoFails.length === 0
    if (paidNow.length > 0) {
      setDone((prev) => new Set([...prev, ...paidNow.map((r) => r.id)]))
      onPaid(paidNow, { closed: allDone })
    }
    if (allDone) {
      onOpenChange(false)
      return
    }
    setFailures(fails)
    setMemoFailed(memoFails)
    onReload()
  }

  const errFor = (id: number) => errors.find((e) => e.field === `pay-${id}`)?.message

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? undefined : onOpenChange(o))}>
      <DialogContent showCloseButton={false} className="app-shell flex max-h-[calc(100dvh-2rem)] flex-col gap-4 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-warm-tan px-5 pb-3 pt-5 text-left">
          <DialogTitle className="text-lg font-semibold text-dark">납부 처리</DialogTitle>
          <DialogDescription className="text-[15px] leading-relaxed text-[#3f3f4e] [word-break:keep-all]">
            통장에 찍힌 입금일을 넣어 주세요. 잘못 바꿨다면 바로 뒤 [되돌리기]나 청구서의 [납부 처리 취소]로 되돌릴 수 있어요.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5">
          <ErrorSummary
            errors={errors}
            title={
              errors.every((e) => e.message === "입금일을 골라 주세요")
                ? `입금일을 고르지 않은 건이 ${errors.length}건 있어요`
                : `입금일을 확인해 주세요(${errors.length}건)`
            }
          />
          {formError && <Notice tone="danger">{formError}</Notice>}
          {failures.length > 0 && (
            <Notice tone="danger" title={`${failures.length}건은 바꾸지 못했어요`}>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {failures.map((f) => (
                  <li key={f.id}>
                    {f.name}: {f.error}
                  </li>
                ))}
              </ul>
              <p className="mt-1">목록을 다시 불러왔어요. 남은 건만 다시 처리할 수 있어요.</p>
            </Notice>
          )}
          {memoFailed.length > 0 && (
            <Notice tone="warning" title="납부 처리는 됐지만 메모는 저장하지 못했어요">
              {memoFailed.join(", ")} — 청구서를 열어 메모를 다시 적어 주세요.
            </Notice>
          )}
          {done.size > 0 && pending.length > 0 && (
            <p className="text-[15px] text-[#3f3f4e]">{done.size}건은 납부 완료로 바꿨어요. 아래는 남은 건이에요.</p>
          )}

          {pending.length > 0 && (
            <>
              <div className="rounded-md border border-warm-tan bg-warm-ivory p-3">
                <Label htmlFor="pay-common" className="text-[15px] font-medium text-dark">
                  모두 같은 날짜
                </Label>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Input id="pay-common" type="date" value={common} max={today} onChange={(e) => setAll(e.target.value)} className="h-10 w-44 bg-card text-[15px]" aria-describedby="pay-common-hint" />
                  <Button type="button" variant="outline" size="sm" className="h-10 hover:bg-warm-beige hover:text-dark" onClick={() => setAll(today)}>
                    오늘
                  </Button>
                </div>
                <p id="pay-common-hint" className="mt-1.5 text-sm text-[#3f3f4e]">
                  통장에 찍힌 날짜를 넣어 주세요. 고르면 아래 모든 건에 들어가고, 건마다 다시 고칠 수 있어요.
                </p>
              </div>

              <ul className="divide-y divide-warm-tan rounded-md border border-warm-tan" aria-label="납부 처리할 청구서">
                {pending.map((it) => {
                  const r = byId.get(it.id)
                  if (!r) return null
                  const err = errFor(it.id)
                  const warn = check.beforeIssued.includes(it.id)
                    ? `발행일(${dateShort(r.issued_at, today)})보다 앞선 날짜예요`
                    : check.future.includes(it.id)
                      ? "오늘보다 뒤 날짜예요"
                      : null
                  return (
                    <li key={it.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5", !it.include && "bg-warm-beige/50")}>
                      <Checkbox
                        checked={it.include}
                        onCheckedChange={(v) => setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, include: v === true } : x)))}
                        aria-label={`${nameOf(it.id)} 포함`}
                      />
                      <div className={cn("min-w-0 flex-1", !it.include && "text-text-secondary")}>
                        <p className="font-medium text-dark [word-break:keep-all]">{r.tenant_name}</p>
                        <p className="text-sm text-[#3f3f4e]">
                          {billMonthShort(r.period, today)} · <Money value={r.total_amount} />
                        </p>
                      </div>
                      <div className="w-full sm:w-auto">
                        <Label htmlFor={`f-pay-${it.id}`} className="sr-only">
                          {nameOf(it.id)} 입금일
                        </Label>
                        <Input
                          id={`f-pay-${it.id}`}
                          type="date"
                          value={it.date}
                          disabled={!it.include}
                          onChange={(e) => {
                            const v = e.target.value
                            setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, date: v } : x)))
                            setErrors((prev) => prev.filter((x) => x.field !== `pay-${it.id}`))
                          }}
                          aria-invalid={err ? true : undefined}
                          aria-describedby={err || warn ? `f-pay-${it.id}-msg` : undefined}
                          className="h-10 w-full bg-card text-[15px] sm:w-44"
                        />
                        {(err || warn) && it.include && (
                          <p id={`f-pay-${it.id}-msg`} className={cn("mt-1 text-sm", err ? "text-red-800" : "text-amber-800")}>
                            {err ?? warn}
                          </p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>

              <div>
                <Label htmlFor="pay-memo" className="text-[15px] font-medium text-dark">
                  메모(선택)
                </Label>
                <Input id="pay-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 입금자명 솔바람" className="mt-1.5 h-10 bg-card text-[15px]" aria-describedby="pay-memo-hint" />
                <p id="pay-memo-hint" className="mt-1 text-sm text-[#3f3f4e]">
                  적으면 각 청구서의 기존 메모 뒤에 “입금일 입금 확인 · 메모”로 덧붙어요.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-row flex-wrap items-center justify-end gap-2 border-t border-warm-tan px-5 py-3">
          {pending.length > 0 && (
            <p className="mr-auto text-[15px] tabular-nums text-[#3f3f4e]" aria-live="polite">
              {included.length}건 · 합계 {won(includedSum)}
            </p>
          )}
          <Button type="button" variant="outline" className="hover:bg-warm-beige hover:text-dark" disabled={busy} onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          {pending.length > 0 && (
            <BusyButton type="button" busy={busy} busyLabel="처리 중…" onClick={submit}>
              {included.length}건 납부 완료로 바꾸기
            </BusyButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
