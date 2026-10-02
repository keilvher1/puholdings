"use client"

// 월 마감 화면(클라이언트 본체) — "이번 마감" 카드 + 서버 상태 Stepper + 단계 1~4.
// - 월·단계는 주소에 남긴다(?month=사용월&step=1..4, lib/links.ts). 월을 바꾸면 서버가 새로 그리고(key=사용월) 입력값이 비워진다(가드 #6).
// - 단계 상태는 close-status(= getCloseProgress) 값을 그대로 그린다. 쓰기 뒤에는 다시 읽고 router.refresh()로 배지를 갱신한다.
// - 발행된 달은 1·2단계를 읽기 전용으로 보인다. [정정 시작]은 아무것도 저장하지 않고 잠금만 푼다(네트워크 요청 없음).
// - 저장 안 한 변경이 있는 채로 달을 바꾸면 확인창(useConfirm)을 띄운다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Callout, Notice, Stepper, toastInfo, useConfirm, type ValueSource } from "@/components/saas"
import { parseUnitValue } from "@/components/saas/unit-input-model"
import type { FactoryReadings } from "@/lib/billing"
import { toNumber } from "@/lib/format"
import { billingCloseHref, type CloseStepNumber } from "@/lib/links"
import { friendlyError } from "@/lib/messages"
import { api } from "./api"
import { CloseCard, STEP_LABELS } from "./close-card"
import {
  buildStep2Payload,
  factoryMetersReady,
  initialStep2Form,
  isStep2Dirty,
  metersBlockText,
  per10ToSave,
  previewAllocation,
  step2Primary,
  validateStep2,
  type Step2Field,
  type Step2Form,
  type Step2Saved,
} from "./close-model"
import { StepAllocation } from "./step-allocation"
import { StepGenerate } from "./step-generate"
import { StepIssue } from "./step-issue"
import { StepMeters, type MeterRow } from "./step-meters"
import type { CloseStatus } from "./types"

const STEP_KEYS = ["meters", "allocation", "generate", "issue"] as const
const norm = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : parseUnitValue(String(v), { decimals: 1 }))

interface MetersResponse {
  meters: { code: string; name: string; curr_reading: string | number | null; prev_reading: string | number | null; typical_usage: number | null }[]
}
interface PeriodResponse {
  period: { elec_total?: string | number | null; elec_unit_price?: string | number | null; area_ratio?: string | number | null; per10_billed?: string | number | null; due_date?: string | null; created_at?: string }
  pyeong_sum_area: string | number
}

export function MonthClose({
  initial,
  initialStep,
  mailEnabled,
  scanEnabled,
  today,
}: {
  initial: CloseStatus
  initialStep: CloseStepNumber
  mailEnabled: boolean
  scanEnabled: boolean
  today: string
}) {
  const router = useRouter()
  const ask = useConfirm()
  const um = initial.usageMonth
  const monthRef = useRef(um)

  const [status, setStatus] = useState<CloseStatus>(initial)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [step, setStep] = useState<CloseStepNumber>(initialStep)
  const [unlocked, setUnlocked] = useState(false)

  // 서버가 다시 그리면(router.refresh) 그 값으로 맞춘다
  const [prevInitial, setPrevInitial] = useState(initial)
  if (initial !== prevInitial) {
    setPrevInitial(initial)
    setStatus(initial)
  }

  // ── 1단계 상태 ─────────────────────────────────────────────────────────────
  const [meterRows, setMeterRows] = useState<MeterRow[] | null>(null)
  const [metersError, setMetersError] = useState<string | null>(null)
  const [meterInput, setMeterInput] = useState<Record<string, string | null>>({})
  const [meterSource, setMeterSource] = useState<Record<string, ValueSource>>({})
  const [meterSaving, setMeterSaving] = useState(false)
  const [meterSaveError, setMeterSaveError] = useState<string | null>(null)
  const [meterFlash, setMeterFlash] = useState(false)
  const [meterFieldErrors, setMeterFieldErrors] = useState<Record<string, string>>({})

  // ── 2단계 상태 ─────────────────────────────────────────────────────────────
  const [saved2, setSaved2] = useState<Step2Saved | null>(null)
  const [pyeongSum, setPyeongSum] = useState(0)
  const [form2, setForm2] = useState<Step2Form | null>(null)
  const [periodError, setPeriodError] = useState<string | null>(null)
  const [elecSource, setElecSource] = useState<ValueSource | null>(null)
  const [saving2, setSaving2] = useState(false)
  const [saveError2, setSaveError2] = useState<string | null>(null)
  const [flash2, setFlash2] = useState(false)
  const [fieldErrors2, setFieldErrors2] = useState<Partial<Record<Step2Field, string>>>({})

  const loadMeters = useCallback(async () => {
    setMetersError(null)
    const r = await api<MetersResponse>(`/api/admin/billing/meters?period=${um}`)
    if (monthRef.current !== um) return null
    if (!r.ok || !r.data) {
      setMetersError(friendlyError(r.status, r.error, "검침 값을 불러오지 못했어요."))
      return null
    }
    const rows: MeterRow[] = r.data.meters.map((m) => ({
      code: String(m.code),
      name: String(m.name),
      prev: toNumber(m.prev_reading),
      curr: toNumber(m.curr_reading),
      typical: m.typical_usage ?? null,
    }))
    setMeterRows(rows)
    return rows
  }, [um])

  const loadPeriod = useCallback(async () => {
    setPeriodError(null)
    const r = await api<PeriodResponse>(`/api/admin/billing/periods?period=${um}`)
    if (monthRef.current !== um) return null
    if (!r.ok || !r.data) {
      setPeriodError(friendlyError(r.status, r.error, "전기료 배분 값을 불러오지 못했어요."))
      return null
    }
    const p = r.data.period ?? {}
    const exists = p.created_at !== undefined || p.elec_unit_price !== undefined
    const s: Step2Saved = {
      exists,
      elecTotal: toNumber(p.elec_total ?? null),
      unitPrice: toNumber(p.elec_unit_price ?? null),
      areaRatio: toNumber(p.area_ratio ?? null),
      per10: toNumber(p.per10_billed ?? null),
      dueDate: p.due_date ?? null,
    }
    setSaved2(s)
    setPyeongSum(toNumber(r.data.pyeong_sum_area) ?? 0)
    return s
  }, [um])

  useEffect(() => {
    monthRef.current = um
    let alive = true
    ;(async () => {
      const [rows, s] = await Promise.all([loadMeters(), loadPeriod()])
      if (!alive) return
      if (rows) setMeterInput(Object.fromEntries(rows.map((m) => [m.code, norm(m.curr)])))
      if (s) setForm2(initialStep2Form(s))
    })()
    return () => {
      alive = false
    }
  }, [um, loadMeters, loadPeriod])

  // ── 상태 다시 읽기 ─────────────────────────────────────────────────────────
  const reload = useCallback(async (): Promise<CloseStatus | null> => {
    const r = await api<{ status: CloseStatus }>(`/api/admin/billing/close-status?month=${um}`)
    if (monthRef.current !== um) return null
    if (!r.ok || !r.data) {
      setStatusError(friendlyError(r.status, r.error, "진행 상태를 다시 불러오지 못했어요."))
      return null
    }
    setStatusError(null)
    setStatus(r.data.status)
    return r.data.status
  }, [um])

  // 주소에 달을 박아 둔다. 파라미터 없이(/admin/billing) 연 채로 쓰기 뒤 router.refresh()를 하면 서버가 기본 월을
  // 다시 골라(발행이 끝나면 다음 달로 넘어감) key가 바뀌고 화면이 다음 달 1단계로 바뀌어 버린다(완료 화면을 못 봄).
  const pinUrl = useCallback(
    (n: CloseStepNumber) => {
      try {
        const sp = new URLSearchParams(window.location.search)
        if (sp.get("month") !== um || sp.get("step") !== String(n)) window.history.replaceState(null, "", billingCloseHref(um, n))
      } catch {
        // 주소를 못 바꿔도 화면은 동작한다
      }
    },
    [um],
  )
  const stepRef = useRef<CloseStepNumber>(initialStep)
  useEffect(() => {
    pinUrl(stepRef.current)
  }, [pinUrl])

  const afterWrite = useCallback(async () => {
    pinUrl(stepRef.current)
    await reload()
    router.refresh()
  }, [pinUrl, reload, router])

  // ── 파생 값 ────────────────────────────────────────────────────────────────
  const issuedAll = status.bills.issued + status.bills.overdue + status.bills.paid
  const locked = issuedAll > 0 && status.bills.correcting === 0 && !unlocked

  const metersDirtyCount = useMemo(() => {
    if (!meterRows) return 0
    return meterRows.filter((m) => norm(meterInput[m.code]) !== norm(m.curr)).length
  }, [meterRows, meterInput])

  // 1단계 검침이 모두 저장되고 음수가 없을 때만 2단계 배분을 계산한다(검침 전 달에 엉터리 제안값을 만들지 않는다)
  const metersReady = useMemo(() => (meterRows ? factoryMetersReady(meterRows) : null), [meterRows])

  const ctx2 = useMemo(() => {
    if (!meterRows) return null
    const readings: FactoryReadings = { MAIN: 0, F101: 0, F103: 0, HVAC: 0 }
    const prevReadings: FactoryReadings = { MAIN: 0, F101: 0, F103: 0, HVAC: 0 }
    for (const m of meterRows) {
      if (m.code in readings) {
        readings[m.code as keyof FactoryReadings] = m.curr ?? 0
        prevReadings[m.code as keyof FactoryReadings] = m.prev ?? 0
      }
    }
    return { readings, prevReadings, pyeongSum }
  }, [meterRows, pyeongSum])

  const step2 = useMemo(() => {
    if (!form2 || !saved2 || !ctx2) return null
    const ready = !!metersReady?.ready
    const base = ready ? previewAllocation(form2, ctx2) : null
    const suggested = base ? base.alloc.per10Suggested : null
    const per10 = per10ToSave(form2, saved2, suggested)
    const preview = ready ? previewAllocation(form2, ctx2, per10) : null
    const dirty = isStep2Dirty(form2, saved2, suggested)
    return { suggested, preview, dirty, primary: step2Primary(dirty, locked) }
  }, [form2, saved2, ctx2, locked, metersReady])

  const anyDirty = (!locked && metersDirtyCount > 0) || (!locked && !!step2?.dirty)

  // ── 이동 ───────────────────────────────────────────────────────────────────
  const topRef = useRef<HTMLDivElement>(null)
  const goStep = useCallback(
    (n: CloseStepNumber) => {
      setStep(n)
      stepRef.current = n
      try {
        window.history.replaceState(null, "", billingCloseHref(um, n))
      } catch {
        // 주소를 못 바꿔도 화면은 동작한다
      }
      requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: "start" }))
    },
    [um],
  )

  const goMonth = async (ym: string) => {
    if (ym === um) return
    if (anyDirty) {
      const ok = await ask({
        title: "저장하지 않은 변경이 있어요. 다른 달로 갈까요?",
        body: "다른 달로 가면 이 달에서 고친 값은 저장되지 않고 사라져요.",
        confirmLabel: "저장하지 않고 이동",
      })
      if (!ok) return
    }
    router.push(billingCloseHref(ym))
  }

  // ── 1단계 저장 ─────────────────────────────────────────────────────────────
  const saveMeters = async () => {
    if (!meterRows) return
    if (locked || metersDirtyCount === 0) return goStep(2)
    const errs: Record<string, string> = {}
    for (const m of meterRows) {
      if (m.curr !== null && norm(meterInput[m.code]) === null) errs[m.code] = "저장된 지침은 지울 수 없어요. 이번 달 지침을 넣어 주세요"
    }
    setMeterFieldErrors(errs)
    if (Object.keys(errs).length > 0) {
      const first = Object.keys(errs)[0]
      requestAnimationFrame(() => {
        const el = (document.getElementById(`f-meter-${first}`)?.offsetParent ? document.getElementById(`f-meter-${first}`) : document.getElementById(`f-meter-${first}-m`)) as HTMLElement | null
        el?.focus()
      })
      return
    }
    const readings = meterRows.filter((m) => norm(meterInput[m.code]) !== null).map((m) => ({ code: m.code, reading: Number(norm(meterInput[m.code])) }))
    const negative = meterRows.some((m) => {
      const v = toNumber(meterInput[m.code])
      return v !== null && m.prev !== null && v < m.prev
    })
    setMeterSaving(true)
    setMeterSaveError(null)
    const r = await api("/api/admin/billing/meters", { method: "PUT", json: { period: um, readings } })
    setMeterSaving(false)
    if (!r.ok) {
      setMeterSaveError(friendlyError(r.status, r.error, "검침을 저장하지 못했어요."))
      return
    }
    const rows = await loadMeters()
    if (rows) setMeterInput(Object.fromEntries(rows.map((m) => [m.code, norm(m.curr)])))
    setMeterSource({})
    setMeterFlash(true)
    setTimeout(() => setMeterFlash(false), 2000)
    await afterWrite()
    if (!negative) goStep(2)
  }

  // ── 2단계 저장 ─────────────────────────────────────────────────────────────
  const saveAllocation = async () => {
    if (!form2 || !saved2 || !step2) return
    if (step2.primary.action === "next") return goStep(3)
    const check = validateStep2(form2, step2.suggested)
    // 제안값이 계산 전(검침 미저장 등)인데 직접 입력 칸이 비었으면 "제안값으로 확정"을 고를 수 없으니 칸 오류로 둔다
    if (check.needsPer10Decision && step2.suggested === null) {
      check.errors.per10 = "10평당 청구단가를 넣어 주세요"
      check.needsPer10Decision = false
    }
    setFieldErrors2(check.errors)
    const order: Step2Field[] = ["elecTotal", "unitPrice", "areaPct", "per10"]
    const first = order.find((k) => check.errors[k])
    if (first) {
      requestAnimationFrame(() => {
        if (first === "areaPct") (document.getElementById("f-areaPct")?.closest("details") as HTMLDetailsElement | null)?.setAttribute("open", "")
        document.getElementById(`f-${first}`)?.focus()
      })
      return
    }
    let override: "suggested" | null | undefined = undefined
    if (check.needsPer10Decision) {
      const r = await ask({
        title: "10평당 단가를 확정하지 않고 저장할까요?",
        body: "확정하지 않으면 청구서를 만들 때마다 그때의 제안값이 쓰여서, 검침·한전 금액이 바뀌면 단가도 같이 바뀌어요.",
        confirmLabel: step2.suggested !== null ? `제안값 ${step2.suggested.toLocaleString("ko-KR")}원으로 확정하고 저장` : "제안값으로 확정하고 저장",
        altAction: { label: "확정하지 않고 저장" },
      })
      if (r === true) override = "suggested"
      else if (r === "alt") override = null
      else return // [닫기]는 저장하지 않는다
    }
    const body = buildStep2Payload(um, form2, saved2, step2.suggested, override)
    if (!body) return
    setSaving2(true)
    setSaveError2(null)
    const r = await api("/api/admin/billing/periods", { method: "POST", json: body })
    setSaving2(false)
    if (!r.ok) {
      setSaveError2(friendlyError(r.status, r.error, "배분을 저장하지 못했어요."))
      return
    }
    const s = await loadPeriod()
    if (s) setForm2(initialStep2Form(s))
    setElecSource(null)
    setFlash2(true)
    setTimeout(() => setFlash2(false), 2000)
    await afterWrite()
    goStep(3)
  }

  // ── 잠금 안내(1·2단계 위) ──────────────────────────────────────────────────
  const lockNotice =
    issuedAll > 0 && status.bills.correcting === 0 ? (
      unlocked ? (
        <Notice
          tone="warning"
          title="정정 중이에요"
          className="mb-4"
          action={
            <Button type="button" size="sm" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={() => setUnlocked(false)}>
              정정 그만두기
            </Button>
          }
        >
          1·2단계 값을 고쳐 저장한 뒤 3단계에서 [청구서 다시 만들기]를 눌러 주세요. 그 전까지 발행된 청구서는 바뀌지 않아요.
        </Notice>
      ) : status.needsCorrection ? (
        <Notice
          tone="warning"
          title="발행 뒤 전기 값이 바뀌었어요"
          className="mb-4"
          action={
            <Button type="button" size="sm" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={() => setUnlocked(true)}>
              정정 시작
            </Button>
          }
        >
          정정이 필요할 수 있어요. [정정 시작]을 누르면 값을 고칠 수 있어요(누르기만 해서는 아무것도 바뀌지 않아요).
        </Notice>
      ) : (
        <Notice
          tone="info"
          className="mb-4"
          action={
            <Button type="button" size="sm" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={() => setUnlocked(true)}>
              정정 시작
            </Button>
          }
        >
          이 달은 발행됐어요. 값을 고치려면 [정정 시작]을 눌러 주세요(누르기만 해서는 아무것도 바뀌지 않아요).
        </Notice>
      )
    ) : null

  const stepItems = status.steps.map((s, i) => ({ ...s, label: STEP_LABELS[i] }))

  return (
    <div>
      {status.isOlderThanLatestIssued && (
        <Notice tone="warning" title="지난 달을 보고 있어요" className="mb-3">
          청구서를 다시 만들면 지금 계약 기준으로 계산돼요(그 뒤 입주한 기업도 들어갈 수 있어요).
        </Notice>
      )}
      {status.needsCorrection && step > 2 && (
        <Notice tone="warning" className="mb-3">
          발행 뒤 전기 값이 바뀌었어요. 정정이 필요할 수 있어요. 1·2단계에서 [정정 시작]을 눌러 확인해 주세요.
        </Notice>
      )}
      {statusError && (
        <Notice
          tone="danger"
          className="mb-3"
          action={
            <Button type="button" size="sm" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={() => void reload()}>
              다시 시도
            </Button>
          }
        >
          {statusError}
        </Notice>
      )}

      <CloseCard status={status} today={today} step={step} onMonth={goMonth} onGoStep={goStep} />

      <div ref={topRef} className="scroll-mt-20" />
      <div className="lg:[@media(max-height:760px)]:hidden">
        <Stepper label="월 마감 단계" steps={stepItems} current={STEP_KEYS[step - 1]} onSelect={(_k, i) => goStep((i + 1) as CloseStepNumber)} className="mb-3" />
      </div>
      {/* 휴대폰: Stepper가 한 줄로 줄어드니 단계로 바로 가는 버튼을 따로 둔다 */}
      <nav aria-label="단계로 이동" className="-mt-1 mb-3 flex gap-1.5 sm:hidden">
        {STEP_LABELS.map((l, i) => (
          <Button
            key={l}
            type="button"
            size="sm"
            variant={step === i + 1 ? "default" : "outline"}
            className={step === i + 1 ? "h-11 flex-1" : "h-11 flex-1 hover:bg-warm-beige hover:text-dark"}
            aria-current={step === i + 1 ? "step" : undefined}
            aria-label={`${i + 1}단계 ${l}`}
            onClick={() => goStep((i + 1) as CloseStepNumber)}
          >
            {i + 1}
          </Button>
        ))}
      </nav>

      {step <= 2 && (
        <Callout storageKey="billing-close-prep" className="mb-3 lg:[@media(max-height:760px)]:hidden">
          준비할 것: 한전 고지서(공장동 사용단가·청구금액), 공장동 계량기 사진 4장
        </Callout>
      )}

      {step === 1 && (
        <StepMeters
          rows={meterRows}
          loadError={metersError}
          onRetry={async () => {
            const rows = await loadMeters()
            if (rows) setMeterInput(Object.fromEntries(rows.map((m) => [m.code, norm(m.curr)])))
          }}
          input={meterInput}
          sources={meterSource}
          onInput={(code, v) => {
            setMeterInput((p) => ({ ...p, [code]: v }))
            setMeterSource((p) => ({ ...p, [code]: "manual" }))
            if (meterFieldErrors[code]) setMeterFieldErrors((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== code)))
          }}
          locked={locked}
          lockNotice={lockNotice}
          unitPrice={status.allocation.kwhUnitPrice}
          scanEnabled={scanEnabled}
          usageMonth={um}
          onScanApply={(readings, kepco) => {
            if (Object.keys(readings).length > 0) {
              setMeterInput((p) => ({ ...p, ...Object.fromEntries(Object.entries(readings).map(([k, v]) => [k, norm(v)])) }))
              setMeterSource((p) => ({ ...p, ...Object.fromEntries(Object.keys(readings).map((k) => [k, "auto" as const])) }))
            }
            if (kepco !== null) {
              setForm2((f) => (f ? { ...f, elecTotal: String(Math.round(kepco)) } : f))
              setElecSource("auto")
            }
            toastInfo("자동 인식한 값을 칸에 채웠어요. 숫자를 확인한 뒤 저장해 주세요")
          }}
          dirtyCount={metersDirtyCount}
          saving={meterSaving}
          saveError={meterSaveError}
          savedFlash={meterFlash}
          fieldErrors={meterFieldErrors}
          onPrimary={saveMeters}
        />
      )}
      {step === 2 && (
        <StepAllocation
          usageMonth={um}
          form={form2}
          setForm={(patch) => {
            setForm2((f) => (f ? { ...f, ...patch } : f))
            if ("elecTotal" in patch) setElecSource(elecSource ? "manual" : null)
            const keys = Object.keys(patch) as (keyof Step2Form)[]
            if (keys.some((k) => k !== "per10Choice")) setFieldErrors2((e) => {
              const next = { ...e }
              for (const k of keys) delete next[(k === "per10Manual" ? "per10" : k) as Step2Field]
              return next
            })
          }}
          saved={saved2}
          pyeongSum={pyeongSum}
          preview={step2?.preview ?? null}
          suggested={step2?.suggested ?? null}
          metersBlock={metersReady ? metersBlockText(metersReady) : null}
          onGoMeters={() => goStep(1)}
          loadError={periodError ?? metersError}
          onRetry={async () => {
            const [rows, s] = await Promise.all([loadMeters(), loadPeriod()])
            if (rows && Object.keys(meterInput).length === 0) setMeterInput(Object.fromEntries(rows.map((m) => [m.code, norm(m.curr)])))
            if (s && !form2) setForm2(initialStep2Form(s))
          }}
          kepco={status.kepco}
          locked={locked}
          lockNotice={lockNotice}
          elecSource={elecSource}
          dirty={!!step2?.dirty && !locked}
          primaryLabel={step2?.primary.label ?? "다음: 청구서 만들기"}
          saving={saving2}
          saveError={saveError2}
          savedFlash={flash2}
          fieldErrors={fieldErrors2}
          onPrimary={saveAllocation}
          onPrev={() => goStep(1)}
        />
      )}
      {step === 3 && (
        <StepGenerate
          status={status}
          today={today}
          mailEnabled={mailEnabled}
          locked={locked}
          step2Dirty={!locked && !!step2?.dirty}
          metersDirty={!locked && metersDirtyCount > 0}
          onGoStep={goStep}
          afterWrite={afterWrite}
          onPrev={() => goStep(2)}
          onNext={() => goStep(4)}
        />
      )}
      {step === 4 && (
        <StepIssue status={status} today={today} mailEnabled={mailEnabled} onGoStep={goStep} reload={reload} afterWrite={afterWrite} onPrev={() => goStep(3)} />
      )}
    </div>
  )
}
