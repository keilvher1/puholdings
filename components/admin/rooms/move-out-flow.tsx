"use client"

// 퇴실 처리 3단계(입주 중 시트 안, 계획서 4.3.4): [1 입력] → [2 정산 확인] → [3 완료].
// - 2단계 숫자는 실행 **전에** 조회 전용 GET …/end/preview로 보여 준다(end/route.ts와 같은 SQL, 테스트로 묶음).
// - 2단계가 확인 화면이다. [○○호 퇴실 처리하기]를 눌러야만 POST …/end가 나간다(확인 없이 실행되는 경로 없음).
// - 3단계 결과 카드는 preview가 아니라 **end 응답 값**으로 그린다(그사이 납부 처리가 있었을 수 있다).
// - "결과를 메모로 남기기"는 POST /api/admin/notes, "기업 상태도 ‘퇴실’로"는 GET으로 받은 기업 행 전체 + status로 PUT(가드 #21).
// - 마지막 달 기본 "한 달 전액"(full, 가드 #26). "아직 돌려주지 않았어요"면 반환액 빈값 → 서버가 NULL로 둔다(가드 #12).

import { useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { FieldError } from "@/components/ui/field"
import {
  BusyButton,
  ErrorSummary,
  Money,
  Notice,
  ResultCard,
  Stepper,
  StickyActionBar,
  WonInput,
  toastSuccess,
  useConfirm,
  useFieldErrors,
  type StepItem,
} from "@/components/saas"
import { billsHref, billingCloseHrefForBillMonth, tenantsHref } from "@/lib/links"
import { friendlyError } from "@/lib/messages"
import { billMonthShort, date, dateShort, todayKST, won } from "@/lib/format"
import {
  LAST_MONTH_LABEL,
  MOVE_OUT_LABELS,
  isAfterThisMonth,
  lastMonthBillingLine,
  lastMonthIssuedWarning,
  lastMonthText,
  monthlyCharge,
  moveOutDefaults,
  moveOutNoteTitle,
  moveOutPayload,
  proratedEstimate,
  settlement,
  validateMoveOut,
  type BoardRoom,
  type EndPreview,
  type MonthBilling,
  type MoveOutField,
  type MoveOutForm,
} from "./move-model"

export interface ContractRow {
  id: number
  tenant_id: number
  tenant_name: string
  room_code: string
  building: string
  start_date: string | null
  pyeong_billed: string | number
  rent_unit_price: string | number
  mgmt_fee: string | number
  deposit_actual: string | number | null
  elec_method: "area" | "metered"
  status: string
  ended_at: string | null
}

type Step = "input" | "confirm" | "done"

interface EndResult {
  deposit: number
  unpaid: number
  suggested: number
  returned: number
  depositRecorded: boolean
  recordedReturn: boolean
  form: MoveOutForm
  tenantName: string
  tenantId: number
  noteState: "skipped" | "saved" | "failed"
  statusState: "skipped" | "saved" | "failed"
  noteTitle: string
  otherRooms: string[]
}

/** "2026-11-15" → "11월 15일"(문장 속 괄호 안에 쓰려고 요일 없이) */
function shortMD(d: string): string {
  return `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`
}

function Row({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr_auto] items-baseline gap-x-3 gap-y-1 py-2.5">
      <dt className="text-[15px] text-[#3f3f4e]">{label}</dt>
      <dd className="min-w-0 text-[15px] text-dark [word-break:keep-all]">{children}</dd>
      <div>{action}</div>
    </div>
  )
}

export function MoveOutFlow({
  room,
  contract,
  onReload,
  onDone,
  onCancel,
  onDirtyChange,
}: {
  room: BoardRoom
  contract: ContractRow | null
  onReload: () => Promise<BoardRoom[] | null>
  onDone: () => void
  onCancel: () => void
  /** 입력을 바꿨거나 2단계(정산 확인)에 있으면 true — 시트를 Esc·바깥 클릭으로 닫을 때 확인을 묻는다 */
  onDirtyChange?: (dirty: boolean) => void
}) {
  const router = useRouter()
  const ask = useConfirm()
  const [step, setStep] = useState<Step>("input")
  const [initial] = useState<MoveOutForm>(() => moveOutDefaults(room.ended_at))
  const [form, setForm] = useState<MoveOutForm>(initial)
  const [preview, setPreview] = useState<EndPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [keepNote, setKeepNote] = useState(true)
  const [setMovedOut, setSetMovedOut] = useState(false)
  const [result, setResult] = useState<EndResult | null>(null)
  const [retrying, setRetrying] = useState<"note" | "status" | null>(null)
  const fe = useFieldErrors<MoveOutField>(MOVE_OUT_LABELS)
  const contractId = room.contract_id

  // 완료 전에는 2단계에 있거나 입력을 바꿨으면 "닫으면 사라짐"(입주 폼과 같은 규칙)
  const dirty = step !== "done" && (step === "confirm" || JSON.stringify(form) !== JSON.stringify(initial))
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const cancel = async () => {
    if (dirty) {
      const ok = await ask({
        title: "입력한 내용을 버리고 닫을까요?",
        body: "닫으면 퇴실 처리에 입력한 내용이 사라져요. 아직 퇴실 처리는 하지 않았어요.",
        confirmLabel: "버리고 닫기",
        cancelLabel: "계속 입력하기",
        tone: "danger",
      })
      if (!ok) return
    }
    onDirtyChange?.(false)
    onCancel()
  }
  const tenantName = contract?.tenant_name ?? room.tenant_name ?? ""
  const tenantId = contract?.tenant_id ?? room.tenant_id ?? 0

  const charge = contract ? monthlyCharge(contract.pyeong_billed, contract.rent_unit_price, contract.mgmt_fee) : null
  const lastEst = contract
    ? proratedEstimate("last", form.ended_at, { pyeong: contract.pyeong_billed, rent: contract.rent_unit_price, mgmt: contract.mgmt_fee })
    : null
  const futureEnd = isAfterThisMonth(form.ended_at)
  const futureWarning = futureEnd ? (
    <Notice tone="warning">
      퇴실일({shortMD(form.ended_at)})이 다음 달 이후예요. 지금 처리하면 호실이 오늘부터 공실로 보이고, 아직 만들지 않은 청구서에서 이 계약
      임대료가 빠질 수 있어요. 퇴실하는 달에 처리해 주세요.
    </Notice>
  ) : null

  const steps: StepItem[] = useMemo(
    () => [
      { key: "input", label: "입력", status: step === "input" ? "current" : "done" },
      { key: "confirm", label: "정산 확인", status: step === "confirm" ? "current" : step === "done" ? "done" : "todo" },
      { key: "done", label: "완료", status: step === "done" ? "done" : "todo" },
    ],
    [step],
  )

  const set = <K extends keyof MoveOutForm>(k: K, v: MoveOutForm[K], field?: MoveOutField) => {
    setForm((f) => ({ ...f, [k]: v }))
    if (field) fe.clear(field)
  }

  const loadPreview = async (): Promise<EndPreview | null> => {
    if (!contractId) return null
    const res = await fetch(`/api/admin/contracts/${contractId}/end/preview?ended_at=${encodeURIComponent(form.ended_at)}`, {
      credentials: "include",
      cache: "no-store",
    })
    const d = await res.json().catch(() => null)
    if (!res.ok || !d?.success) throw Object.assign(new Error("preview"), { status: res.status, msg: d?.error })
    return d.preview as EndPreview
  }

  const next = async () => {
    if (busy) return
    setError(null)
    if (!fe.check(validateMoveOut(form))) return
    setBusy(true)
    try {
      const p = await loadPreview()
      setPreview(p)
      setSetMovedOut(false)
      setStep("confirm")
    } catch (e) {
      const err = e as { status?: number; msg?: string }
      setError(`정산을 미리 계산하지 못했어요. ${friendlyError(err.status ?? 0, err.msg, "")}`.trim())
    } finally {
      setBusy(false)
    }
  }

  const followUps = async (r: Omit<EndResult, "noteState" | "statusState">, wantNote: boolean, wantStatus: boolean) => {
    let noteState: EndResult["noteState"] = "skipped"
    let statusState: EndResult["statusState"] = "skipped"
    if (wantNote) noteState = (await saveNote(r.noteTitle, r)) ? "saved" : "failed"
    if (wantStatus) statusState = (await saveMovedOut(r.tenantId)) ? "saved" : "failed"
    return { noteState, statusState }
  }

  const execute = async () => {
    if (busy || !contractId || !preview) return
    setError(null)
    setBusy(true)
    let status = 0
    let serverMsg: string | undefined
    try {
      // 실행 직전에 다시 확인: 그사이 다른 곳에서 퇴실 처리했으면 end를 다시 부르지 않는다(반환 기록이 NULL로 덮이지 않게),
      // 받을 돈·보증금·발행 여부가 바뀌었으면 바뀐 숫자를 보이고 한 번 더 확인받는다.
      let fresh: EndPreview
      try {
        fresh = (await loadPreview()) as EndPreview
      } catch (e) {
        const err = e as { status?: number; msg?: string }
        setError(`처리 전에 상태를 확인하지 못했어요. ${friendlyError(err.status ?? 0, err.msg, "")}`.trim())
        return
      }
      if (!fresh || fresh.contract.status !== "active") {
        if (fresh) setPreview(fresh)
        return
      }
      if (
        fresh.unpaid_total !== preview.unpaid_total ||
        fresh.deposit_actual !== preview.deposit_actual ||
        fresh.end_month_issued !== preview.end_month_issued ||
        fresh.other_active_contracts.length !== preview.other_active_contracts.length
      ) {
        setPreview(fresh)
        setError("그사이 받을 돈이나 청구서 상태가 바뀌었어요. 바뀐 숫자를 확인하고 다시 눌러 주세요.")
        return
      }
      try {
        const res = await fetch(`/api/admin/contracts/${contractId}/end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(moveOutPayload(form)),
        })
        status = res.status
        const d = await res.json().catch(() => null)
        if (res.ok && d?.success) {
          await finish(d.offset, preview)
          return
        }
        serverMsg = d?.error
      } catch {
        status = 0
      }
      // 응답을 못 받았어도 서버가 이미 끝냈을 수 있다 → 상태를 다시 읽어 사실대로 보인다(같은 버튼을 다시 누르게 하지 않는다)
      const again = await loadPreview().catch(() => null)
      if (again && again.contract.status === "ended") {
        setPreview(again)
        setError("퇴실 처리는 이미 끝났어요. 처리 결과를 받지 못해 아래 숫자는 다시 조회한 값이에요.")
        await finish(
          { deposit_actual: again.deposit_actual, unpaid_total: again.unpaid_total, suggested_return: again.suggested_return, returned_amount: again.suggested_return },
          again,
          true,
        )
        return
      }
      setError(friendlyError(status, serverMsg))
    } finally {
      setBusy(false)
    }
  }

  const finish = async (
    offset: { deposit_actual: number; unpaid_total: number; suggested_return: number; returned_amount: number },
    p: EndPreview,
    recheck = false,
  ) => {
    const base = {
      deposit: Number(offset.deposit_actual),
      unpaid: Number(offset.unpaid_total),
      suggested: Number(offset.suggested_return),
      returned: recheck && form.deposit === "returned" ? Number(form.returned_amount) : Number(offset.returned_amount),
      depositRecorded: p.deposit_recorded,
      recordedReturn: form.deposit === "returned",
      form,
      tenantName: p.contract.tenant_name || tenantName,
      tenantId: p.contract.tenant_id || tenantId,
      otherRooms: p.other_active_contracts.map((o) => `${o.room_code}호`),
      noteTitle: moveOutNoteTitle({
        tenantName: p.contract.tenant_name || tenantName,
        roomCode: room.code,
        deposit: Number(offset.deposit_actual),
        unpaid: Number(offset.unpaid_total),
        depositRecorded: p.deposit_recorded,
      }),
    }
    const canStatus = p.other_active_contracts.length === 0
    const states = await followUps(base, keepNote, setMovedOut && canStatus)
    setResult({ ...base, ...states })
    setStep("done")
    toastSuccess(`${room.code}호 퇴실 처리를 마쳤어요`)
    onDone()
    void onReload()
    router.refresh()
  }

  async function saveNote(title: string, r: Omit<EndResult, "noteState" | "statusState">): Promise<boolean> {
    try {
      const lines = [
        `퇴실일 ${date(r.form.ended_at)} · ${lastMonthText(r.form.last_month_billing)}`,
        r.recordedReturn
          ? `보증금 반환 기록: ${won(r.form.returned_amount)} (${date(r.form.returned_at)})`
          : "보증금은 아직 돌려주지 않았어요(반환 기록 없음)",
      ]
      const res = await fetch("/api/admin/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title, body: lines.join("\n"), category: "memo" }),
      })
      const d = await res.json().catch(() => null)
      return res.ok && !!d?.success
    } catch {
      return false
    }
  }

  /** 기업 상태를 ‘퇴실’로: GET으로 받은 행 전체 + status(보내지 않은 칸이 지워지지 않게, 가드 #21) */
  async function saveMovedOut(tid: number): Promise<boolean> {
    try {
      const res = await fetch("/api/admin/tenants", { credentials: "include", cache: "no-store" })
      const d = await res.json().catch(() => null)
      if (!res.ok || !d?.success) return false
      const row = (d.tenants as Record<string, unknown>[]).find((t) => Number(t.id) === tid)
      if (!row) return false
      const put = await fetch("/api/admin/tenants", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // 기업 카드의 퇴실일도 이번 퇴실일로 맞춘다
        body: JSON.stringify({ ...row, status: "moved_out", move_out_date: form.ended_at }),
      })
      const pd = await put.json().catch(() => null)
      return put.ok && !!pd?.success
    } catch {
      return false
    }
  }

  const retry = async (what: "note" | "status") => {
    if (!result || retrying) return
    setRetrying(what)
    const ok = what === "note" ? await saveNote(result.noteTitle, result) : await saveMovedOut(result.tenantId)
    setResult({ ...result, ...(what === "note" ? { noteState: ok ? "saved" : "failed" } : { statusState: ok ? "saved" : "failed" }) })
    if (ok) {
      toastSuccess(what === "note" ? "메모를 남겼어요" : "기업 상태를 ‘퇴실’로 바꿨어요")
      router.refresh()
    }
    setRetrying(null)
  }

  const err = (k: MoveOutField) => (
    <FieldError id={fe.errorId(k)} className="text-[15px]">
      {fe.errors[k]}
    </FieldError>
  )

  // ── 3 완료 ──────────────────────────────────────────────────────────────
  if (step === "done" && result) {
    const s = settlement({ deposit: result.deposit, unpaid: result.unpaid, depositRecorded: result.depositRecorded })
    const copy = [
      `${result.tenantName} ${room.code}호 퇴실 처리를 마쳤어요`,
      `퇴실일 ${date(result.form.ended_at)} · ${lastMonthText(result.form.last_month_billing)}`,
      result.depositRecorded
        ? `보증금 ${won(result.deposit)} − 받을 돈 ${won(result.unpaid)} → ${s.kind === "owed" ? `받을 돈 ${won(s.amount)} 남음` : `돌려줄 금액 ${won(s.amount)}`}`
        : `보증금 기록 없음 · 받을 돈 ${won(result.unpaid)}`,
      result.recordedReturn ? `보증금 반환 기록 ${won(result.returned)}` : "보증금 반환 기록 없음",
    ].join("\n")
    return (
      <div className="space-y-4">
        <Stepper steps={steps} current="done" label="퇴실 처리 단계" />
        {error && <Notice tone="warning">{error}</Notice>}
        <ResultCard
          title={`${room.code}호 퇴실 처리를 마쳤어요`}
          rows={[
            { label: "호실 · 기업", value: `${room.building} ${room.code}호 · ${result.tenantName}` },
            { label: "퇴실일", value: `${date(result.form.ended_at)} · ${lastMonthText(result.form.last_month_billing)}` },
            { label: "보증금", value: result.depositRecorded ? result.deposit : "기록 없음" },
            { label: "받을 돈", value: result.unpaid },
            s.kind === "return"
              ? { label: "돌려줄 금액", value: s.amount, emphasis: true }
              : s.kind === "owed"
                ? { label: "받을 돈 남음", value: s.amount, emphasis: true }
                : { label: "정산", value: "돌려줄 금액·받을 돈 없음" },
            ...(result.recordedReturn ? [{ label: "돌려준 금액(기록)", value: result.returned }] : []),
          ]}
          notes={[
            s.text,
            result.otherRooms.length > 0
              ? `이 기업의 다른 진행 중 계약(${result.otherRooms.join("·")})이 남아 있어요. 받을 돈은 기업 전체 기준이라 보증금 상계는 마지막 계약을 퇴실할 때 하세요`
              : "",
            result.noteState === "saved" ? "결과를 메모로 남겼어요(홈 메모에서 볼 수 있어요)" : "",
            result.statusState === "saved" ? "기업 상태를 ‘퇴실’로 바꿨어요" : "",
            "작성 중인 청구서·원상복구비·마지막 달 전기료는 위 계산에 들어가지 않아요",
          ].filter(Boolean)}
          nextSteps={[
            { label: "원상복구비가 있으면 추가 청구 만들기", href: billsHref({ add: true, tenant: result.tenantId }) },
            { label: "기업 상태 확인", href: tenantsHref({ tenant: result.tenantId }) },
          ]}
          copyText={copy}
          printable
        />
        <p className="text-sm text-text-secondary">보증금을 돌려준 뒤에는 반환일·금액을 메모로 남겨 주세요(반환 기록 화면은 아직 없어요).</p>
        {result.noteState === "failed" && (
          <Notice
            tone="warning"
            action={
              <BusyButton type="button" variant="outline" size="sm" busy={retrying === "note"} busyLabel="처리 중…" onClick={() => void retry("note")}>
                메모 다시 남기기
              </BusyButton>
            }
          >
            퇴실 처리는 끝났지만 결과 메모를 남기지 못했어요.
          </Notice>
        )}
        {result.statusState === "failed" && (
          <Notice
            tone="warning"
            action={
              <BusyButton type="button" variant="outline" size="sm" busy={retrying === "status"} busyLabel="처리 중…" onClick={() => void retry("status")}>
                기업 상태 다시 바꾸기
              </BusyButton>
            }
          >
            퇴실 처리는 끝났지만 기업 상태를 ‘퇴실’로 바꾸지 못했어요.
          </Notice>
        )}
        <div className="flex justify-end">
          <Button type="button" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={onCancel}>
            호실 정보 보기
          </Button>
        </div>
      </div>
    )
  }

  // ── 2 정산 확인 ─────────────────────────────────────────────────────────
  if (step === "confirm" && preview) {
    const s = settlement({ deposit: preview.deposit_actual, unpaid: preview.unpaid_total, depositRecorded: preview.deposit_recorded })
    const others = preview.other_active_contracts
    const issuedWarn = lastMonthIssuedWarning({ endMonthIssued: preview.end_month_issued, endMonth: preview.end_month, lastMonth: form.last_month_billing })
    const ended = preview.contract.status !== "active"
    // 호실·기업은 이 시트에서 바꿀 수 없으므로 [변경]은 1단계에서 고칠 수 있는 퇴실일·마지막 달에만 둔다
    const change = (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 text-link underline hover:bg-warm-beige"
        onClick={() => setStep("input")}
        disabled={busy}
        aria-label="퇴실일·마지막 달 바꾸기"
      >
        변경
      </Button>
    )
    return (
      <div className="space-y-4">
        <Stepper steps={steps} current="confirm" label="퇴실 처리 단계" onSelect={(k) => k === "input" && !busy && setStep("input")} />
        <h3 className="text-lg font-semibold text-dark">이대로 퇴실 처리할까요?</h3>
        {futureWarning}
        {ended && <Notice tone="danger">이 계약은 이미 퇴실 처리됐어요. 다시 처리하면 보증금 반환 기록이 지워질 수 있어서 여기서는 실행하지 않아요.</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
        <dl className="divide-y divide-warm-tan/70 rounded-md border border-warm-tan bg-card px-4">
          <Row label="호실 · 기업">
            {room.building} {room.code}호 · {preview.contract.tenant_name}
          </Row>
          <Row label="퇴실일" action={change}>
            {date(form.ended_at)} · {lastMonthText(form.last_month_billing)}
          </Row>
          <Row label="보증금">{preview.deposit_recorded ? <Money value={preview.deposit_actual} /> : "기록 없음"}</Row>
          <Row label="받을 돈">
            <Money value={preview.unpaid_total} />
            <span className="block text-sm text-text-secondary">
              납부 대기·기한 지남 {preview.unpaid_count}건, 이 기업 전체 기준
            </span>
          </Row>
          {s.kind === "return" ? (
            <Row label={others.length > 0 ? "보증금 − 받을 돈(참고)" : "돌려줄 금액"}>
              <span className="text-base">
                <Money value={s.amount} strong />
              </span>
              <span className="block text-sm text-text-secondary">= 보증금 − 받을 돈</span>
            </Row>
          ) : s.kind === "even" ? (
            <Row label="정산">{s.text}</Row>
          ) : (
            <Row label="받을 돈 남음">
              <strong className="text-base font-bold text-red-800">{won(s.amount)}</strong>
              <span className="block text-sm text-text-secondary">{s.text}</span>
            </Row>
          )}
          {form.deposit === "returned" && (
            <Row label="돌려준 금액">
              <Money value={form.returned_amount} /> · {date(form.returned_at)}에 돌려줬다고 기록해요
            </Row>
          )}
        </dl>
        {others.length > 0 && (
          <Notice tone="warning" title={`이 기업의 다른 진행 중 계약 ${others.length}건(${others.map((o) => `${o.room_code}호`).join("·")})`}>
            받을 돈은 기업 전체 기준이에요. 보증금 상계는 마지막 계약을 퇴실할 때 하세요.
          </Notice>
        )}
        {issuedWarn && (
          <Notice
            tone="warning"
            action={
              preview.end_month ? (
                <Button asChild variant="outline" size="sm" className="hover:bg-warm-beige hover:text-dark">
                  <Link href={billingCloseHrefForBillMonth(preview.end_month)}>월 마감 열기</Link>
                </Button>
              ) : undefined
            }
          >
            {issuedWarn}
          </Notice>
        )}
        <div className="rounded-md border border-warm-tan bg-warm-ivory/60 px-4 py-3">
          <p className="text-[15px] font-semibold text-dark">처리하면</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-[15px] leading-relaxed text-dark [word-break:keep-all]">
            <li>
              {/* 퇴실일이 아직 오지 않았어도 처리하는 순간 공실이 된다(퇴실 예약은 다음 라운드) — 뜻밖이지 않게 미리 적는다 */}
              {form.ended_at && form.ended_at > todayKST()
                ? `${room.code}호는 퇴실일 ${dateShort(form.ended_at)} 전이어도 지금 바로 ‘공실’로 바뀌어요. 되돌릴 수 없어요.`
                : `${room.code}호는 바로 ‘공실’로 바뀌어요. 되돌릴 수 없어요.`}
            </li>
            {preview.end_month && (
              <li>
                {lastMonthBillingLine({
                  endMonth: preview.end_month,
                  lastMonth: form.last_month_billing,
                  endMonthIssued: preview.end_month_issued,
                  futureEnd,
                })}
              </li>
            )}
            <li>작성 중인 청구서·원상복구비·마지막 달 전기료는 위 계산에 들어가지 않아요. 필요하면 청구서 화면에서 추가 청구를 만들어요.</li>
          </ul>
        </div>
        <div className="space-y-3">
          <div className="flex items-start gap-2.5">
            <Checkbox id="mo-note" checked={keepNote} onCheckedChange={(v) => setKeepNote(v === true)} className="mt-1" />
            <Label htmlFor="mo-note" className="flex flex-col items-start gap-0.5 text-base font-normal text-dark">
              결과를 메모로 남기기
              <span className="text-sm text-text-secondary">홈 메모에 정산 결과 한 줄이 남아요</span>
            </Label>
          </div>
          <div className="flex items-start gap-2.5">
            <Checkbox
              id="mo-status"
              checked={setMovedOut && others.length === 0}
              disabled={others.length > 0}
              onCheckedChange={(v) => setSetMovedOut(v === true)}
              className="mt-1"
              aria-describedby="mo-status-desc"
            />
            <Label htmlFor="mo-status" className="flex flex-col items-start gap-0.5 text-base font-normal text-dark">
              기업 상태도 ‘퇴실’로 바꾸기
              <span id="mo-status-desc" className="text-sm text-text-secondary [word-break:keep-all]">
                {others.length > 0
                  ? "이 기업에 다른 진행 중 계약이 있어서 바꿀 수 없어요"
                  : "바꾸면 포털 로그인이 막혀 남은 청구서를 볼 수 없어요"}
              </span>
            </Label>
          </div>
        </div>
        <StickyActionBar
          className="-mx-5 -mb-4 rounded-none sm:-mx-5"
          secondary={
            <Button type="button" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={() => setStep("input")} disabled={busy}>
              이전
            </Button>
          }
          primary={
            ended ? undefined : (
              <BusyButton type="button" busy={busy} busyLabel="처리 중…" onClick={() => void execute()}>
                {room.code}호 퇴실 처리하기
              </BusyButton>
            )
          }
        />
      </div>
    )
  }

  // ── 1 입력 ──────────────────────────────────────────────────────────────
  const lastDesc: Record<MonthBilling, string | undefined> = {
    full: charge ? won(charge.gross) : undefined,
    prorated: lastEst ? `${billMonthShort(lastEst.ym)} ${lastEst.usedDays}일 = ${won(lastEst.amount)}` : "퇴실일을 고르면 예상액이 보여요",
    none: undefined,
  }
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void next()
      }}
      className="space-y-4"
      aria-label={`${room.code}호 퇴실 처리`}
    >
      <Stepper steps={steps} current="input" label="퇴실 처리 단계" />
      <h3 className="text-lg font-semibold text-dark">
        {room.code}호 퇴실 처리 — {tenantName}
      </h3>
      <ErrorSummary errors={fe.summary} />
      {error && <Notice tone="danger">{error}</Notice>}
      {!contractId && <Notice tone="danger">진행 중인 계약이 없어서 퇴실 처리를 할 수 없어요.</Notice>}

      <div className="space-y-1.5">
        <Label htmlFor={fe.fieldId("endedAt")} className="text-base font-medium">
          퇴실일
        </Label>
        <Input
          {...fe.field("endedAt")}
          type="date"
          value={form.ended_at}
          onChange={(e) => set("ended_at", e.target.value, "endedAt")}
          className="h-10 w-full bg-card text-base md:text-base sm:w-56"
        />
        {err("endedAt")}
        {room.ended_at && form.ended_at === room.ended_at && <p className="text-sm text-text-secondary">계약의 종료 예정일로 채웠어요.</p>}
      </div>
      {futureWarning}

      <div className="space-y-2">
        <p id="mo-last-label" className="text-base font-medium text-dark">
          마지막 달
        </p>
        <RadioGroup
          aria-labelledby="mo-last-label"
          value={form.last_month_billing}
          onValueChange={(v) => set("last_month_billing", v as MonthBilling)}
          className="gap-2"
        >
          {(["full", "prorated", "none"] as const).map((k) => (
            <div key={k} className="flex items-start gap-2.5">
              <RadioGroupItem id={`mo-last-${k}`} value={k} className="mt-1" />
              <Label htmlFor={`mo-last-${k}`} className="flex flex-col items-start gap-0.5 text-base font-normal leading-snug text-dark">
                {LAST_MONTH_LABEL[k]}
                {lastDesc[k] && <span className="text-sm text-text-secondary tabular-nums">{lastDesc[k]}</span>}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <p id="mo-dep-label" className="text-base font-medium text-dark">
          보증금 반환
        </p>
        <RadioGroup
          aria-labelledby="mo-dep-label"
          value={form.deposit}
          onValueChange={(v) => {
            set("deposit", v as MoveOutForm["deposit"])
            if (v === "returned" && !form.returned_at && form.ended_at) set("returned_at", form.ended_at)
            fe.clear("returnedAt")
            fe.clear("returnedAmount")
          }}
          className="gap-2"
        >
          <div className="flex items-start gap-2.5">
            <RadioGroupItem id="mo-dep-no" value="not_yet" className="mt-1" />
            <Label htmlFor="mo-dep-no" className="text-base font-normal text-dark">
              아직 돌려주지 않았어요
            </Label>
          </div>
          <div className="flex items-start gap-2.5">
            <RadioGroupItem id="mo-dep-yes" value="returned" className="mt-1" />
            <Label htmlFor="mo-dep-yes" className="text-base font-normal text-dark">
              돌려줬어요
            </Label>
          </div>
        </RadioGroup>
        {form.deposit === "returned" && (
          <div className="ml-7 space-y-3 border-l-2 border-warm-tan pl-3">
            <div className="space-y-1.5">
              <Label htmlFor={fe.fieldId("returnedAt")} className="text-base font-medium">
                반환일
              </Label>
              <Input
                {...fe.field("returnedAt")}
                type="date"
                value={form.returned_at}
                onChange={(e) => set("returned_at", e.target.value, "returnedAt")}
                className="h-10 w-full bg-card text-base md:text-base sm:w-56"
              />
              {err("returnedAt")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={fe.fieldId("returnedAmount")} className="text-base font-medium">
                돌려준 금액
              </Label>
              <WonInput
                {...fe.field("returnedAmount")}
                value={form.returned_amount}
                onChange={(v) => set("returned_amount", v, "returnedAmount")}
                invalid={!!fe.errors.returnedAmount}
                className="sm:w-56"
              />
              {err("returnedAmount")}
            </div>
          </div>
        )}
        <p className="text-sm text-text-secondary">아직 돌려주지 않았으면 반환 기록 없이 퇴실만 처리해요.</p>
      </div>

      <StickyActionBar
        className="-mx-5 -mb-4 rounded-none sm:-mx-5"
        secondary={
          <Button type="button" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={() => void cancel()} disabled={busy}>
            닫기
          </Button>
        }
        primary={
          <BusyButton type="submit" busy={busy} busyLabel="계산 중…" disabled={!contractId}>
            다음: 정산 확인
          </BusyButton>
        }
      />
    </form>
  )
}
