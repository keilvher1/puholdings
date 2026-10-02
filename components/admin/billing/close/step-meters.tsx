"use client"

// 1단계 검침 — 계량기 4행 표(지난달 지침·이번 달 지침[kWh]·사용량·평소·상태) + 이상 경고 + 값 출처.
// 4칸이 다 차고 오류가 없을 때만 공장동 요금 미리보기를 보인다(검침 전 달에 음수·거대값을 보이지 않는다).
// 판독값은 제안이다. 칸에 채우기만 하고 저장은 사람이 [검침 저장]을 눌러야 한다(CLAUDE.md 9항).

import { useState, type ReactNode } from "react"
import { Camera, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible"
import { BusyButton, EmptyState, Notice, SourceTag, StickyActionBar, TableSkeleton, ToneBadge, UnitInput, type ValueSource } from "@/components/saas"
import { MeterScanPanel } from "@/components/admin/meter-scan-panel"
import { calcFactoryElec, type FactoryReadings } from "@/lib/billing"
import { num, toNumber, won } from "@/lib/format"
import { BILLING_CLOSE_STEP_NOTES } from "@/lib/help/billing-close"
import { meterRowState, type MeterState } from "./close-model"
import { StepHelp } from "./step-help"

export interface MeterRow {
  code: string
  name: string
  prev: number | null
  curr: number | null
  /** 직전 3개월 평균 사용량 */
  typical: number | null
}

const CODES: (keyof FactoryReadings)[] = ["MAIN", "F101", "F103", "HVAC"]

function stateCell(state: MeterState, usage: number | null, typical: number | null) {
  switch (state) {
    case "empty":
      return <span className="text-[#3f3f4e]">입력 전</span>
    case "noPrev":
      return <span className="text-[#3f3f4e]">지난달 지침이 없어요</span>
    case "ok":
      return <span className="text-[#3f3f4e]">정상</span>
    case "check":
      return (
        <span className="flex flex-col items-start gap-0.5">
          <ToneBadge tone="warning">확인 필요</ToneBadge>
          <span className="text-sm text-amber-800 [word-break:keep-all]">
            평소 {num(typical)} → 이번 {num(usage)}. 자릿수를 확인해 주세요
          </span>
        </span>
      )
    case "error":
      return (
        <span className="flex flex-col items-start gap-0.5">
          <ToneBadge tone="danger">오류</ToneBadge>
          <span className="text-sm text-red-800 [word-break:keep-all]">지난달보다 작아요 — 자릿수를 확인해 주세요. 이대로는 청구서를 만들 수 없어요</span>
        </span>
      )
  }
}

export function StepMeters({
  rows,
  loadError,
  onRetry,
  input,
  sources,
  onInput,
  locked,
  lockNotice,
  unitPrice,
  scanEnabled,
  usageMonth,
  onScanApply,
  dirtyCount,
  saving,
  saveError,
  savedFlash,
  fieldErrors,
  onPrimary,
}: {
  rows: MeterRow[] | null
  loadError: string | null
  onRetry: () => void
  input: Record<string, string | null>
  sources: Record<string, ValueSource>
  onInput: (code: string, value: string | null) => void
  locked: boolean
  lockNotice: ReactNode
  /** 저장된 kWh 단가(없으면 공장동 요금 대신 사용량만) */
  unitPrice: number | null
  scanEnabled: boolean
  usageMonth: string
  onScanApply: (readings: Record<string, string>, kepcoTotal: number | null) => void
  dirtyCount: number
  saving: boolean
  saveError: string | null
  savedFlash: boolean
  fieldErrors: Record<string, string>
  onPrimary: () => void
}) {
  const [scanOpen, setScanOpen] = useState(false)

  if (loadError) {
    return <EmptyState kind="error" title="검침 값을 불러오지 못했어요" description={loadError} onRetry={onRetry} bordered />
  }
  if (!rows) return <TableSkeleton rows={4} columns={5} label="검침 값을 불러오는 중…" />

  const states = rows.map((r) => ({ row: r, ...meterRowState(toNumber(input[r.code]), r.prev, r.typical) }))
  const entered = states.filter((s) => s.state !== "empty").length
  const errors = states.filter((s) => s.state === "error").length
  const allIn = rows.length > 0 && entered === rows.length && errors === 0 && states.every((s) => s.state !== "noPrev")
  const checks = states.filter((s) => s.state === "check").length

  let preview: ReactNode
  if (!allIn) {
    preview = `${rows.length}개를 모두 입력하면 공장동 요금이 계산돼요`
  } else if (unitPrice === null) {
    preview = "2단계에서 kWh 단가를 넣으면 공장동 요금이 계산돼요"
  } else {
    const cur: FactoryReadings = { MAIN: 0, F101: 0, F103: 0, HVAC: 0 }
    const prev: FactoryReadings = { MAIN: 0, F101: 0, F103: 0, HVAC: 0 }
    for (const r of rows) {
      const c = r.code as keyof FactoryReadings
      if (!CODES.includes(c)) continue
      cur[c] = toNumber(input[r.code]) ?? 0
      prev[c] = r.prev ?? 0
    }
    const f = calcFactoryElec(cur, prev, unitPrice)
    const detail = (
      <>
        공장동 요금 미리보기(kWh 단가 {won(unitPrice)} 기준): F101 {won(f.F101)} · F102 {won(f.F102)} · F103 {won(f.F103)} → 합계(A){" "}
        <b className="font-semibold text-dark">{won(f.totalA)}</b>
      </>
    )
    // F102(나머지)가 음수면 미리보기 대신 경고 한 줄. '확인 필요' 행이 있으면 경고를 먼저 보이고 숫자는 접어 둔다(거대값을 바로 보이지 않는다)
    if (f.F102 < 0) {
      preview = (
        <span className="font-medium text-amber-800">
          공장동 전체(MAIN) 사용량이 F101·F103·냉난방기 합보다 작아 F102가 0보다 작게 계산돼요. MAIN과 각 지침의 자릿수를 확인해 주세요
        </span>
      )
    } else if (checks > 0) {
      preview = (
        <>
          <span className="block font-medium text-amber-800">평소와 크게 다른 계량기가 {checks}개 있어요. 자릿수를 확인해 주세요</span>
          <details className="mt-1">
            <summary className="inline-flex min-h-8 cursor-pointer items-center underline underline-offset-2">그래도 공장동 요금 보기</summary>
            <span className="mt-1 block">{detail}</span>
          </details>
        </>
      )
    } else {
      preview = detail
    }
  }

  const primaryLabel = locked || dirtyCount === 0 ? "다음: 전기료 배분" : errors > 0 ? "검침 저장하기" : "검침 저장하고 다음"
  const summary = `검침 ${rows.length}개 중 ${entered}개 입력${errors > 0 ? ` · 오류 ${errors}개` : ""}${!locked && dirtyCount > 0 ? ` · 저장 안 한 변경 ${dirtyCount}개` : ""}`

  const label = (r: MeterRow) => (r.code === "MAIN" ? `${r.name}` : r.name)
  const input1 = (r: MeterRow, idSuffix: string) => (
    <>
      <label htmlFor={`f-meter-${r.code}${idSuffix}`} className="sr-only">
        {r.name} 이번 달 지침
      </label>
      <UnitInput
        id={`f-meter-${r.code}${idSuffix}`}
        unit="kWh"
        value={input[r.code] ?? null}
        onChange={(v) => onInput(r.code, v)}
        readOnly={locked}
        aria-readonly={locked || undefined}
        invalid={!!fieldErrors[r.code]}
        aria-describedby={fieldErrors[r.code] ? `f-meter-${r.code}-err` : undefined}
        className={locked ? "w-full min-w-36 bg-warm-ivory" : "w-full min-w-36"}
      />
      {fieldErrors[r.code] && (
        <p id={`f-meter-${r.code}-err`} role="alert" className="mt-1 text-sm text-red-800">
          {fieldErrors[r.code]}
        </p>
      )}
    </>
  )

  return (
    <div>
      {lockNotice}
      <div className="rounded-md border border-warm-tan bg-card">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-warm-tan px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-dark">1단계 · 검침 입력</h2>
            <p className="mt-0.5 text-[15px] text-text-secondary [word-break:keep-all] lg:[@media(max-height:760px)]:hidden">공장동 계량기 4개의 이번 달 숫자(누적 지침)를 넣어 주세요</p>
          </div>
          {!locked &&
            (scanEnabled ? (
              <Button type="button" variant="outline" size="sm" className="hover:bg-warm-beige hover:text-dark" aria-expanded={scanOpen} aria-controls="meter-scan" onClick={() => setScanOpen((v) => !v)}>
                <Camera aria-hidden />
                사진으로 채우기
                <ChevronDown className={scanOpen ? "rotate-180" : ""} aria-hidden />
              </Button>
            ) : (
              <p className="text-[15px] text-[#3f3f4e]">자동 인식이 설정되지 않았어요 — 직접 입력해 주세요</p>
            ))}
        </div>
        {scanEnabled && !locked && (
          <Collapsible open={scanOpen} onOpenChange={setScanOpen}>
            <CollapsibleContent id="meter-scan" className="border-b border-warm-tan px-4 py-3 sm:px-5">
              <MeterScanPanel period={usageMonth} onApplyReadings={(r) => onScanApply(r, null)} onApplyKepco={(t) => onScanApply({}, t)} />
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* 데스크톱 표 */}
        <table className="hidden w-full text-[15px] sm:table">
          <caption className="sr-only">계량기별 검침</caption>
          <thead className="bg-warm-ivory text-left text-sm text-[#3f3f4e]">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium sm:pl-5">계량기</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">지난달 지침</th>
              <th scope="col" className="px-3 py-2 font-medium">이번 달 지침</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">사용량(kWh)</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">평소(최근 3개월)</th>
              <th scope="col" className="px-3 py-2 font-medium sm:pr-5">상태</th>
            </tr>
          </thead>
          <tbody>
            {states.map(({ row: r, state, usage }) => (
              <tr key={r.code} className="border-t border-warm-tan/70 align-top">
                <th scope="row" className="px-4 py-3 text-left font-medium text-dark sm:pl-5">
                  {label(r)}
                  <SourceTag source={sources[r.code]} />
                  {r.code === "MAIN" && <span className="block text-sm font-normal text-[#3f3f4e]">F102 요금에 영향</span>}
                </th>
                <td className="px-3 py-3 text-right tabular-nums text-[#3f3f4e]">{num(r.prev)}</td>
                <td className="px-3 py-2">{input1(r, "")}</td>
                <td className="px-3 py-3 text-right tabular-nums">{usage === null ? "-" : num(usage)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-[#3f3f4e]">{num(r.typical)}</td>
                <td className="px-3 py-3 sm:pr-5">{stateCell(state, usage, r.typical)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 휴대폰 목록 */}
        <ul className="divide-y divide-warm-tan/70 sm:hidden">
          {states.map(({ row: r, state, usage }) => (
            <li key={r.code} className="px-4 py-3">
              <p className="font-medium text-dark">
                {label(r)}
                <SourceTag source={sources[r.code]} />
              </p>
              {r.code === "MAIN" && <p className="text-sm text-[#3f3f4e]">F102 요금에 영향</p>}
              <div className="mt-2">{input1(r, "-m")}</div>
              <p className="mt-1.5 text-sm tabular-nums text-[#3f3f4e]">
                지난달 {num(r.prev)} · 사용 {usage === null ? "-" : num(usage)} · 평소 {num(r.typical)}
              </p>
              <div className="mt-1 text-[15px]">{stateCell(state, usage, r.typical)}</div>
            </li>
          ))}
        </ul>

        <div className="border-t border-warm-tan px-4 py-3 text-[15px] leading-relaxed text-[#3f3f4e] sm:px-5 [word-break:keep-all]">{preview}</div>
      </div>

      <StepHelp notes={BILLING_CLOSE_STEP_NOTES.meters} className="mt-4" />

      {saveError && (
        <Notice tone="danger" title="검침을 저장하지 못했어요" className="mt-4">
          {saveError}
        </Notice>
      )}
      <StickyActionBar
        summary={summary}
        primary={
          <span className="flex items-center gap-2">
            {savedFlash && (
              <span role="status" className="text-[15px] font-medium text-green-800">
                저장했어요
              </span>
            )}
            <BusyButton type="button" busy={saving} busyLabel="저장 중…" onClick={onPrimary}>
              {primaryLabel}
            </BusyButton>
          </span>
        }
      />
    </div>
  )
}
