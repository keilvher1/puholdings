"use client"

// 추가 청구 만들기 — 오른쪽 시트(계획서 4.4.7 B-5, 가드 #19). 기업(검색 콤보박스, 퇴실 기업 포함)과 청구월을 고르는 순간 네 가지 중 하나를 알려 준다.
//   ① 그 달 작성 중 청구서가 있음 → [그 청구서에 항목으로 추가](기존 PUT lines, 조정 manual만)
//   ② 그 달 청구서를 이미 발행했음 → 다음 달 작성 중 청구서가 있을 때만 [다음 달 청구서에 항목으로 추가], 없으면 안내 + [할 일 메모로 남기기]
//   ③ 월 마감 생성이 그 달 정기 청구서를 만들 기업(진행 중 계약 또는 그 달에 끝난 계약)이고 그 달 청구서가 없음 → 막음
//      (수기 청구서가 있으면 월 마감 생성이 그 기업을 건너뛰어 정기 청구가 빠진다. 판정은 generateWouldBill — 생성과 같은 기준)
//   ④ 그 밖이고 그 달 청구서가 없음 → 새 수기 청구서(기존 manual POST, 라인 종류 manual만) — [작성 중으로 저장] / [저장하고 바로 발행]
// 판정은 (기업, 청구월) 열쇠와 함께 둔다. 지금 고른 값과 열쇠가 다르면(확인 중) 항목 칸·저장 버튼을 그리지 않는다.
// 서버(manual POST)는 ③을 검사하지 않으므로 [저장] 직전에 한 번 더 판정한다.
// 주소 ?add=1&tenant=ID&period=YYYY-MM으로 열면 기업·청구월을 채워 연다(입주·퇴실 완료 카드 링크용).
// 생성·발행 API는 바꾸지 않는다(호출만).

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  BusyButton,
  CardSkeleton,
  DetailSheet,
  EmptyState,
  MonthPicker,
  Notice,
  SearchCombobox,
  StatusBadge,
  WonInput,
  toastSuccess,
  useConfirm,
} from "@/components/saas"
import { addMonths, billMonth, billMonthShort, isYm, thisMonthKST, todayKST, won } from "@/lib/format"
import { billingCloseHrefForBillMonth } from "@/lib/links"
import { MSG } from "@/lib/messages"
import { addChargeDecision, buildLinesPayload, generateWouldBill, manualEditsFrom, validateChargeItems, type AddChargeDecision, type ChargeItemEdit } from "./bill-model"
import { createManualBill, createNote, fetchBill, fetchTenantBills, fetchTenantContracts, fetchTenants, issueOne, saveLines, type TenantOption } from "./bills-api"

let seq = 0
const newItem = (): ChargeItemEdit => ({ key: `c-${++seq}`, label: "", amount: null })

/** 판정 결과 — key(기업|청구월)가 지금 고른 값과 같을 때만 쓴다 */
interface Check {
  key: string
  decision: AddChargeDecision | null
  /** 막음의 근거가 그 달에 끝난 계약뿐(퇴실한 달) */
  endedOnly: boolean
  error: string | null
}

const checkKey = (tenantId: number, period: string) => `${tenantId}|${period}`

/** 그 기업 청구서 + 계약을 읽어 네 가지 중 하나로 판정 */
async function judge(tenantId: number, period: string): Promise<Check> {
  const key = checkKey(tenantId, period)
  const [bills, contracts] = await Promise.all([fetchTenantBills(tenantId), fetchTenantContracts(tenantId)])
  if (!bills.ok || !contracts.ok) {
    return { key, decision: null, endedOnly: false, error: (!bills.ok ? bills.error : !contracts.ok ? contracts.error : null) ?? MSG.loadFailed }
  }
  const g = generateWouldBill(contracts.data, period)
  return { key, decision: addChargeDecision({ period, bills: bills.data, hasActiveContract: g.bills }), endedOnly: g.endedOnly, error: null }
}

export function AddChargeSheet({
  open,
  onOpenChange,
  onDone,
  mailEnabled,
  initialTenantId = null,
  initialPeriod = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * 저장 뒤: 바뀐(만든) 청구서 id — 부르는 쪽이 목록을 다시 읽고 그 청구서를 연다. 메모만 남겼으면 null.
   * issueError: 수기 청구서는 저장했지만 발행이 실패했을 때 그 이유(열리는 청구서 시트에 Notice로 보인다)
   */
  onDone: (billId: number | null, issueError?: string) => void
  mailEnabled: boolean
  /** 열 때 채울 기업 id(주소 ?tenant=) */
  initialTenantId?: string | null
  /** 열 때 채울 청구월(주소 ?period=, YYYY-MM) */
  initialPeriod?: string | null
}) {
  const ask = useConfirm()
  const today = todayKST()
  const [tenants, setTenants] = useState<TenantOption[] | null>(null)
  const [tenantsError, setTenantsError] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [period, setPeriod] = useState(thisMonthKST())
  const [check, setCheck] = useState<Check | null>(null)
  const [items, setItems] = useState<ChargeItemEdit[]>([newItem()])
  const [errors, setErrors] = useState<Record<string, { label?: string; amount?: string }>>({})
  const [due, setDue] = useState("")
  const [memo, setMemo] = useState("")
  const [busy, setBusy] = useState<null | "save" | "issue" | "note">(null)
  const [notice, setNotice] = useState<{ tone: "danger" | "warning" | "success"; title?: string; text: string } | null>(null)
  const [tenantError, setTenantError] = useState(false)
  const [retryTick, setRetryTick] = useState(0)

  const maxPeriod = addMonths(thisMonthKST(), 2)

  // 열 때마다 처음부터(주소에 기업·청구월이 있으면 채워서)
  const [prevOpen, setPrevOpen] = useState(false)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setTenantId(initialTenantId && Number(initialTenantId) > 0 ? String(Number(initialTenantId)) : null)
      setPeriod(initialPeriod && isYm(initialPeriod) && initialPeriod <= maxPeriod ? initialPeriod : thisMonthKST())
      setCheck(null)
      setItems([newItem()])
      setErrors({})
      setDue("")
      setMemo("")
      setNotice(null)
      setTenantError(false)
    }
  }

  const loadTenants = useCallback(async () => {
    setTenantsError(null)
    const r = await fetchTenants()
    if (r.ok) setTenants(r.data)
    else setTenantsError(r.error)
  }, [])

  useEffect(() => {
    if (open && tenants === null) void loadTenants()
  }, [open, tenants, loadTenants])

  const tenant = useMemo(() => tenants?.find((t) => String(t.id) === tenantId) ?? null, [tenants, tenantId])

  // 기업·청구월이 정해지면 상태 판정(그 기업 청구서 + 계약). 결과는 열쇠와 함께 두고, 지금 값과 다르면 쓰지 않는다.
  const key = tenant ? checkKey(tenant.id, period) : null
  const current = check && key && check.key === key ? check : null
  const checking = !!tenant && !current
  const decision = current?.decision ?? null
  const checkError = current?.error ?? null

  useEffect(() => {
    if (!open || !tenant) return
    let alive = true
    void judge(tenant.id, period).then((c) => {
      if (alive) setCheck(c)
    })
    return () => {
      alive = false
    }
  }, [open, tenant, period, retryTick])

  const dirty = items.some((it) => it.label.trim() || it.amount) || !!memo.trim()
  const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0)

  const validItems = () => {
    const v = validateChargeItems(items)
    setErrors(v.errors)
    if (Object.keys(v.errors).length > 0) {
      const first = Object.keys(v.errors)[0]
      requestAnimationFrame(() => document.getElementById(`ci-${first}-${v.errors[first].label ? "label" : "amount"}`)?.focus())
      return null
    }
    if (v.lines.length === 0) {
      setNotice({ tone: "danger", text: "청구할 항목을 하나 이상 적어 주세요." })
      return null
    }
    return v.lines
  }

  const requireTenant = () => {
    if (!tenant) {
      setTenantError(true)
      requestAnimationFrame(() => document.getElementById("charge-tenant")?.focus())
      return false
    }
    return true
  }

  /** ①·② 작성 중 청구서에 조정 항목으로 더하기(라인 전체 교체 — 기존 라인 그대로 + 새 조정 라인) */
  const addToDraft = async (targetId: number) => {
    if (!requireTenant()) return
    const lines = validItems()
    if (!lines) return
    setBusy("save")
    setNotice(null)
    const cur = await fetchBill(targetId)
    if (!cur.ok) {
      setBusy(null)
      setNotice({ tone: "danger", title: "청구서를 불러오지 못했어요", text: cur.error })
      return
    }
    if (cur.data.bill.status !== "draft") {
      setBusy(null)
      setNotice({ tone: "warning", text: "그 사이 청구서가 발행됐어요. 청구월을 다시 골라 상태를 확인해 주세요." })
      return
    }
    const edits = [...manualEditsFrom(cur.data.lines), ...lines.map((l) => ({ key: newItem().key, label: l.label, amount: String(l.amount) }))]
    const body = buildLinesPayload(cur.data.lines, edits)
    const r = await saveLines(targetId, body.lines)
    setBusy(null)
    if (!r.ok) {
      setNotice({ tone: "danger", title: "항목을 더하지 못했어요", text: r.error })
      return
    }
    toastSuccess(`${cur.data.bill.tenant_name} ${billMonthShort(cur.data.bill.period, today)} 청구서에 조정 항목 ${lines.length}개를 더했어요`)
    onDone(targetId)
  }

  /** ② 다음 달 청구서가 아직 없을 때: 할 일 메모로 남기기(기존 notes POST) */
  const leaveNote = async () => {
    if (!requireTenant() || !decision) return
    const lines = validItems()
    if (!lines) return
    setBusy("note")
    const next = billMonthShort(decision.nextPeriod, today)
    const r = await createNote(
      `${tenant!.name} ${next} 청구서에 추가 청구 넣기`,
      `${billMonth(period)} 청구서가 이미 발행돼 ${next} 청구서에 조정 항목으로 넣기로 함.\n${lines.map((l) => `- ${l.label} ${won(l.amount)}`).join("\n")}${memo.trim() ? `\n메모: ${memo.trim()}` : ""}`,
    )
    setBusy(null)
    if (!r.ok) {
      setNotice({ tone: "danger", title: "메모를 남기지 못했어요", text: r.error })
      return
    }
    toastSuccess("할 일 메모로 남겼어요", { description: "홈의 메모에서 볼 수 있어요" })
    onDone(null)
  }

  /** ④ 새 수기 청구서 */
  const createNew = async (thenIssue: boolean) => {
    if (!requireTenant()) return
    const lines = validItems()
    if (!lines) return
    // 저장 직전에 한 번 더 판정(서버는 ③을 검사하지 않는다 — 그 사이 계약·청구서가 바뀌었을 수 있다)
    setBusy(thenIssue ? "issue" : "save")
    const again = await judge(tenant!.id, period)
    setBusy(null)
    if (again.decision?.kind !== "new_manual") {
      setCheck(again)
      setNotice({
        tone: "warning",
        title: "저장하지 않았어요",
        text: again.error ? `청구서 상태를 다시 확인하지 못했어요. ${again.error}` : "그 사이 이 기업의 청구서·계약 상태가 바뀌었어요. 아래 안내를 확인해 주세요.",
      })
      return
    }
    if (thenIssue) {
      const ok = await ask({
        title: `${tenant!.name} ${billMonthShort(period, today)} 수기 청구서를 저장하고 바로 발행할까요?`,
        body: "발행하면 입주기업 포털에 보이고 받을 돈에 들어가요.",
        summary: [
          { label: "기업", value: tenant!.name },
          { label: "청구월", value: billMonth(period) },
          { label: "금액", value: won(lines.reduce((s, l) => s + l.amount, 0)) },
        ],
        consequences: [mailEnabled ? "받는 메일이 있으면 PDF가 붙은 발행 메일이 가요" : MSG.mailOff, "잘못 발행했다면 월 마감에서 정정해야 해요"],
        confirmLabel: "저장하고 발행하기",
      })
      if (!ok) return
    }
    setBusy(thenIssue ? "issue" : "save")
    setNotice(null)
    const r = await createManualBill({ tenant_id: tenant!.id, period, due_date: due || undefined, memo: memo.trim() || undefined, lines })
    if (!r.ok) {
      setBusy(null)
      setNotice({ tone: "danger", title: "수기 청구서를 만들지 못했어요", text: r.error })
      return
    }
    if (!thenIssue) {
      setBusy(null)
      toastSuccess(`${tenant!.name} ${billMonthShort(period, today)} 수기 청구서를 작성 중으로 저장했어요`)
      onDone(r.data.id)
      return
    }
    const iss = await issueOne(r.data.id)
    setBusy(null)
    if (!iss.ok) {
      // 저장은 됐다 — 열리는 청구서 시트에 이유와 다음 할 일을 Notice로 보인다
      onDone(r.data.id, iss.error)
      return
    }
    toastSuccess(`${tenant!.name} ${billMonthShort(period, today)} 수기 청구서를 발행했어요`, {
      description: !mailEnabled ? "메일은 나가지 않았어요(메일 발송 꺼짐)" : iss.data.mail.sent > 0 ? "발행 메일을 보냈어요" : undefined,
    })
    onDone(r.data.id)
  }

  const kind = decision?.kind ?? null
  const showItems = !!decision && kind !== "blocked"
  const nextLabel = decision ? billMonthShort(decision.nextPeriod, today) : ""

  let footer: ReactNode = null
  if (decision && kind === "add_to_draft" && decision.target) {
    footer = (
      <BusyButton type="button" busy={busy === "save"} onClick={() => addToDraft(decision.target!.id)}>
        그 청구서에 항목으로 추가
      </BusyButton>
    )
  } else if (decision && kind === "issued") {
    footer = decision.target ? (
      <BusyButton type="button" busy={busy === "save"} onClick={() => addToDraft(decision.target!.id)}>
        다음 달 청구서에 항목으로 추가
      </BusyButton>
    ) : (
      <BusyButton type="button" busy={busy === "note"} onClick={leaveNote}>
        할 일 메모로 남기기
      </BusyButton>
    )
  } else if (decision && kind === "new_manual") {
    footer = (
      <>
        <BusyButton type="button" variant="outline" className="hover:bg-warm-beige hover:text-dark" busy={busy === "issue"} busyLabel="발행 중…" disabled={busy === "save"} onClick={() => createNew(true)}>
          저장하고 바로 발행
        </BusyButton>
        <BusyButton type="button" busy={busy === "save"} disabled={busy === "issue"} onClick={() => createNew(false)}>
          작성 중으로 저장
        </BusyButton>
      </>
    )
  }

  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title="추가 청구 만들기"
      description="퇴실 정산·원상복구비처럼 정기 청구서 밖에서 받을 돈을 더해요"
      dirty={dirty && busy === null}
      footer={
        <>
          <Button type="button" variant="outline" className="mr-auto hover:bg-warm-beige hover:text-dark" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          {footer}
        </>
      }
      size="md"
    >
      <div className="space-y-5">
        {notice && (
          <Notice tone={notice.tone} title={notice.title} onClose={() => setNotice(null)}>
            {notice.text}
          </Notice>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="charge-tenant" className="text-[15px] font-medium text-dark">
            기업
          </Label>
          {tenantsError ? (
            <EmptyState kind="error" title="기업 목록을 불러오지 못했어요" description={tenantsError} onRetry={loadTenants} compact bordered />
          ) : tenants === null ? (
            <CardSkeleton lines={1} label="기업 목록을 불러오는 중…" />
          ) : (
            <SearchCombobox
              id="charge-tenant"
              items={tenants.map((t) => ({
                value: String(t.id),
                label: t.name,
                hint: t.room_no ?? undefined,
                badge: t.status === "moved_out" ? <StatusBadge domain="tenant" status="moved_out" /> : undefined,
              }))}
              value={tenantId}
              onSelect={(v) => {
                setTenantId(v)
                setTenantError(false)
              }}
              placeholder="기업 이름으로 찾기"
              emptyText="맞는 기업이 없어요"
              invalid={tenantError}
              aria-describedby={tenantError ? "charge-tenant-err" : undefined}
            />
          )}
          {tenantError && (
            <p id="charge-tenant-err" className="text-sm text-red-800">
              기업을 골라 주세요
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <p id="charge-period-label" className="text-[15px] font-medium text-dark">
            청구월
          </p>
          <MonthPicker label="청구월" value={period} onChange={setPeriod} format={(ym) => billMonth(ym)} max={maxPeriod} />
        </div>

        {tenant && (
          <div aria-live="polite">
            {checking ? (
              <p className="text-[15px] text-[#3f3f4e]">{tenant.name}의 {billMonthShort(period, today)} 청구서를 확인하는 중…</p>
            ) : checkError ? (
              <EmptyState kind="error" title="청구서 상태를 확인하지 못했어요" description={checkError} onRetry={() => {
                  setCheck(null)
                  setRetryTick((n) => n + 1)
                }}
                compact
                bordered
              />
            ) : decision ? (
              <DecisionNotice decision={decision} endedOnly={current?.endedOnly ?? false} tenantName={tenant.name} period={period} today={today} nextLabel={nextLabel} />
            ) : null}
          </div>
        )}

        {showItems && (
          <section aria-labelledby="charge-items-title" className="space-y-2">
            <h3 id="charge-items-title" className="text-base font-semibold text-dark">
              청구 항목
            </h3>
            <p id="charge-items-hint" className="text-sm text-[#3f3f4e] [word-break:keep-all]">
              항목은 모두 조정 항목으로 들어가요. 차감이면 금액 앞에 −(빼기)를 붙여요.
            </p>
            <ul className="space-y-2">
              {items.map((it, i) => (
                <li key={it.key} className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1 basis-40">
                    <Label htmlFor={`ci-${it.key}-label`} className="sr-only">
                      {i + 1}번째 항목 이름
                    </Label>
                    <Input
                      id={`ci-${it.key}-label`}
                      value={it.label}
                      placeholder="예: 원상복구비"
                      onChange={(e) => setItems((p) => p.map((x) => (x.key === it.key ? { ...x, label: e.target.value } : x)))}
                      aria-invalid={errors[it.key]?.label ? true : undefined}
                      aria-describedby={errors[it.key]?.label ? `ci-${it.key}-label-err` : undefined}
                      className="h-10 text-[15px]"
                    />
                    {errors[it.key]?.label && (
                      <p id={`ci-${it.key}-label-err`} className="mt-1 text-sm text-red-800">
                        {errors[it.key]?.label}
                      </p>
                    )}
                  </div>
                  <div className="w-40">
                    <Label htmlFor={`ci-${it.key}-amount`} className="sr-only">
                      {i + 1}번째 항목 금액
                    </Label>
                    <WonInput
                      id={`ci-${it.key}-amount`}
                      value={it.amount}
                      allowNegative
                      invalid={!!errors[it.key]?.amount}
                      onChange={(v) => setItems((p) => p.map((x) => (x.key === it.key ? { ...x, amount: v } : x)))}
                      aria-describedby={errors[it.key]?.amount ? `ci-${it.key}-amount-err` : "charge-items-hint"}
                    />
                    {errors[it.key]?.amount && (
                      <p id={`ci-${it.key}-amount-err`} className="mt-1 text-sm text-red-800">
                        {errors[it.key]?.amount}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-[#3f3f4e] hover:bg-warm-beige hover:text-red-800"
                    aria-label={`${it.label || `${i + 1}번째`} 항목 삭제`}
                    disabled={items.length === 1}
                    onClick={() => setItems((p) => p.filter((x) => x.key !== it.key))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" size="sm" className="hover:bg-warm-beige hover:text-dark" onClick={() => setItems((p) => [...p, newItem()])}>
                <Plus aria-hidden />
                항목 추가
              </Button>
              <p className="text-[15px] tabular-nums text-dark">
                항목 합계 <span className="font-semibold">{won(total)}</span>
              </p>
            </div>
          </section>
        )}

        {decision && (kind === "new_manual" || (kind === "issued" && !decision.target)) && (
          <section className="space-y-3">
            {kind === "new_manual" && (
              <div className="space-y-1.5">
                <Label htmlFor="charge-due" className="text-[15px] font-medium text-dark">
                  납부 기한(선택)
                </Label>
                <Input id="charge-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-10 w-48 text-[15px]" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="charge-memo" className="text-[15px] font-medium text-dark">
                메모(선택)
              </Label>
              <Input id="charge-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 퇴실 정산" className="h-10 text-[15px]" />
            </div>
          </section>
        )}
      </div>
    </DetailSheet>
  )
}

function DecisionNotice({
  decision,
  endedOnly,
  tenantName,
  period,
  today,
  nextLabel,
}: {
  decision: AddChargeDecision
  endedOnly: boolean
  tenantName: string
  period: string
  today: string
  nextLabel: string
}) {
  const m = billMonthShort(period, today)
  switch (decision.kind) {
    case "add_to_draft":
      return (
        <Notice tone="info" title={`${tenantName}의 ${m} 청구서가 이미 있어요(작성 중)`}>
          아래 항목을 그 청구서에 조정 항목으로 더해요. 월 마감에서 청구서를 다시 만들어도 조정 항목은 남아요.
        </Notice>
      )
    case "issued":
      return (
        <Notice tone="warning" title={`${m} 청구서는 이미 발행됐어요`}>
          발행된 청구서는 정정 절차가 필요해요.{" "}
          {decision.target
            ? `대신 ${nextLabel} 작성 중 청구서에 조정 항목으로 더할 수 있어요.`
            : `${nextLabel} 청구서가 아직 없어요. 다음 달 월 마감 3단계에서 청구서를 만든 뒤 추가해 주세요. 잊지 않게 할 일 메모로 남길 수 있어요.`}
        </Notice>
      )
    case "blocked":
      return (
        <Notice tone="warning" title={`${m} 청구서를 아직 만들지 않았어요`}>
          {endedOnly
            ? `${Number(period.slice(5, 7))}월에 끝난 계약이 있어 월 마감에서 마지막 달 청구서(임대료·관리비·전기료)를 만들어요. 지금 수기 청구서를 만들면 그 청구서가 만들어지지 않아요.`
            : "지금 수기 청구서를 만들면 월 마감에서 이 기업의 정기 청구서(임대료·관리비·전기료)가 만들어지지 않아요."}{" "}
          월 마감 3단계에서 청구서를 만든 뒤 ‘그 청구서에 항목으로 추가’를 써 주세요.{" "}
          <Link href={billingCloseHrefForBillMonth(period, 3)} className="text-link underline underline-offset-2">
            월 마감 3단계 열기
          </Link>
        </Notice>
      )
    default:
      return (
        <Notice tone="info" title="새 수기 청구서를 만들어요">
          진행 중 계약이 없는 기업이라 {m} 수기 청구서를 따로 만들어요(퇴실 정산 등).
        </Notice>
      )
  }
}
