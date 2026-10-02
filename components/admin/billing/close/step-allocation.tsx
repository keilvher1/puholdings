"use client"

// 2단계 전기료 배분 — 한 열 입력(한전 청구금액·kWh 단가·고급 설정) + 결과 3칸 + 10평당 단가 확정 1번 + 검산 한 줄.
// 이동과 저장을 나눈다: 바뀐 값이 있으면 주 버튼 "배분 저장하고 다음", 없으면 "다음: 청구서 만들기".
// 빈칸은 0이 아니라 칸 오류(close-model.validateStep2). 저장된 확정단가는 사람이 고르기 전에는 바꾸지 않는다(가드 #18).

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { BusyButton, EmptyState, ErrorSummary, Money, Notice, SourceTag, StickyActionBar, TableSkeleton, UnitInput, WonInput, type ValueSource } from "@/components/saas"
import type { ElecAllocation } from "@/lib/billing"
import { num, toNumber, won } from "@/lib/format"
import { BILLING_CLOSE_STEP_NOTES } from "@/lib/help/billing-close"
import { billingSettingsHref } from "@/lib/links"
import { cn } from "@/lib/utils"
import { kepcoOutlier, kwhFromNotice, type Step2Field, type Step2Form, type Step2Saved } from "./close-model"
import { StepHelp } from "./step-help"
import type { CloseStatus } from "./types"

/** 원 단가 표시 — 소수가 있으면 둘째 자리까지(117.3원) */
function unitWon(v: number | null): string {
  if (v === null) return "-"
  return Number.isInteger(v) ? won(v) : `${num(v, 2)}원`
}

function FieldErr({ id, children }: { id: string; children?: string }) {
  if (!children) return null
  return (
    <p id={id} role="alert" className="text-sm text-red-800">
      {children}
    </p>
  )
}

export function StepAllocation({
  usageMonth,
  form,
  setForm,
  saved,
  pyeongSum,
  preview,
  suggested,
  metersBlock,
  onGoMeters,
  loadError,
  onRetry,
  kepco,
  locked,
  lockNotice,
  elecSource,
  dirty,
  primaryLabel,
  saving,
  saveError,
  savedFlash,
  fieldErrors,
  onPrimary,
  onPrev,
}: {
  usageMonth: string
  form: Step2Form | null
  setForm: (patch: Partial<Step2Form>) => void
  saved: Step2Saved | null
  pyeongSum: number
  /** 지금 폼으로 계산한 배분(표시용). 계산 전이면 null */
  preview: { factoryA: number; alloc: ElecAllocation } | null
  suggested: number | null
  /** 1단계 검침이 다 저장되지 않았거나 음수가 있어 배분을 계산하지 않을 때 그 이유(계산 가능하면 null) */
  metersBlock: string | null
  onGoMeters: () => void
  loadError: string | null
  onRetry: () => void
  kepco: CloseStatus["kepco"]
  locked: boolean
  lockNotice: ReactNode
  elecSource: ValueSource | null
  dirty: boolean
  primaryLabel: string
  saving: boolean
  saveError: string | null
  savedFlash: boolean
  fieldErrors: Partial<Record<Step2Field, string>>
  onPrimary: () => void
  onPrev: () => void
}) {
  const [noticePrice, setNoticePrice] = useState<string | null>(null)

  if (loadError) return <EmptyState kind="error" title="전기료 배분 값을 불러오지 못했어요" description={loadError} onRetry={onRetry} bordered />
  if (!form || !saved) return <TableSkeleton rows={4} columns={3} label="전기료 배분 값을 불러오는 중…" />

  const elecTotal = toNumber(form.elecTotal)
  const outlier = kepcoOutlier(elecTotal, kepco.prevMonthTotal)
  const helper = toNumber(noticePrice)
  const helped = helper !== null && helper > 0 ? kwhFromNotice(helper) : null
  const lastYearLabel = `작년 ${Number(usageMonth.slice(5, 7))}월`
  const alloc = preview?.alloc ?? null
  const err = (k: Step2Field) => ({ invalid: !!fieldErrors[k], "aria-describedby": fieldErrors[k] ? `f-${k}-error` : undefined })
  // 발행된 달: 흐린 disabled 대신 읽기 전용(글자 대비 유지)
  const ro = { readOnly: locked, "aria-readonly": locked || undefined }
  const roClass = locked ? "bg-warm-ivory" : undefined
  const errorItems = (
    [
      ["elecTotal", "한전 청구금액"],
      ["unitPrice", "공장동 kWh 단가"],
      ["areaPct", "면적별 배분율"],
      ["per10", "10평당 청구단가"],
    ] as const
  )
    .filter(([k]) => fieldErrors[k])
    .map(([k, label]) => ({ field: k, label, message: fieldErrors[k]! }))

  // 검산 한 줄: 계산 전 / 맞아요 / 원인 한 문장
  let check: ReactNode = <span className="text-[#3f3f4e]">{metersBlock ? "1단계 검침을 저장하면 계산해요" : "아직 계산 전이에요"}</span>
  if (preview && alloc) {
    if (preview.factoryA < 0 || (elecTotal !== null && preview.factoryA > elecTotal)) {
      check = (
        <span className="text-red-800">
          공장동(A)이 {preview.factoryA < 0 ? "0원보다 작아요" : "한전 청구금액보다 커요"}. 1단계 검침과 kWh 단가를 확인해 주세요
        </span>
      )
    } else if (alloc.centerC < 0) {
      check = (
        <span className="text-red-800">
          센터 부담이 {won(alloc.centerC)}이에요. {alloc.per10Billed > alloc.per10Calc ? "확정단가가 실계산보다 높아요" : "한전 청구금액이나 1단계 검침을 확인해 주세요"}
        </span>
      )
    } else if (!alloc.checkOk) {
      check = <span className="text-amber-800">확정단가가 실계산({won(Math.round(alloc.per10Calc))})과 많이 달라요. 10평당 단가를 확인해 주세요</span>
    } else {
      check = <span className="text-green-800">배분이 맞아요</span>
    }
  }

  const per10Differs = saved.per10 !== null && suggested !== null && saved.per10 !== suggested

  return (
    <div>
      {lockNotice}
      {pyeongSum === 0 && (
        <Notice
          tone="warning"
          title="면적별 계약이 없어요"
          className="mb-4"
          action={
            <Button asChild size="sm" variant="outline" className="hover:bg-warm-beige hover:text-dark">
              <Link href={billingSettingsHref({ tab: "contracts" })}>
                기준 정보에서 계약 확인하기
                <ChevronRight aria-hidden />
              </Link>
            </Button>
          }
        >
          면적별로 전기료를 나눌 계약이 없어 배분과 청구서 만들기가 되지 않아요.
        </Notice>
      )}
      <div className="rounded-md border border-warm-tan bg-card">
        <div className="border-b border-warm-tan px-4 py-3 sm:px-5">
          <h2 className="text-lg font-semibold text-dark">2단계 · 전기료 배분</h2>
          <p className="mt-0.5 text-[15px] text-text-secondary [word-break:keep-all] lg:[@media(max-height:760px)]:hidden">한전 전기요금을 공장동(A)·사무실 기업(B)·센터(C)로 나눠요</p>
        </div>

        <div className="grid max-w-2xl gap-6 px-4 py-4 sm:px-5">
          <ErrorSummary errors={errorItems} />
          {/* 1. 한전 청구금액 */}
          <div className="grid gap-1.5">
            <Label htmlFor="f-elecTotal" className="text-base">
              한전 청구금액
              <SourceTag source={elecSource} />
            </Label>
            <WonInput id="f-elecTotal" value={form.elecTotal} onChange={(v) => setForm({ elecTotal: v })} {...ro} {...err("elecTotal")} className={cn("max-w-xs", roClass)} />
            <FieldErr id="f-elecTotal-error">{fieldErrors.elecTotal}</FieldErr>
            <p className="text-sm text-text-secondary">한전 고지서의 청구금액이에요. 사용량(kWh)이 아니에요.</p>
            <p className="text-[15px] text-[#3f3f4e]">
              지난달 {kepco.prevMonthTotal === null ? "기록 없음" : won(kepco.prevMonthTotal)} · {lastYearLabel} {kepco.lastYearTotal === null ? "기록 없음" : won(kepco.lastYearTotal)}
            </p>
            {outlier && <p className="text-[15px] font-medium text-amber-800">지난달과 30% 넘게 달라요. 자릿수를 확인해 주세요</p>}
          </div>

          {/* 2. 공장동 kWh 단가 */}
          <div className="grid gap-1.5">
            <Label htmlFor="f-unitPrice" className="text-base">
              공장동 kWh 단가
            </Label>
            {/* 단가는 NUMERIC(8,2) — 소수 2자리까지 받는다(WonInput은 소수점을 버려 117.3 → 1,173이 됐다) */}
            <UnitInput id="f-unitPrice" unit="원/kWh" value={form.unitPrice} onChange={(v) => setForm({ unitPrice: v })} {...ro} {...err("unitPrice")} className={cn("max-w-xs", roClass)} />
            <FieldErr id="f-unitPrice-error">{fieldErrors.unitPrice}</FieldErr>
            <p className="text-sm text-text-secondary">고지서의 사용단가에 1.1을 곱해 원 단위로 반올림한 값이에요. 공장동 요금 계산에 써요.</p>
            {!locked && (
              <div className="mt-1 rounded-md border border-warm-tan bg-warm-ivory px-3 py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[15px] text-dark">
                  <Label htmlFor="notice-price" className="text-[15px] font-normal">
                    고지서의 사용단가
                  </Label>
                  <UnitInput id="notice-price" unit="원/kWh" value={noticePrice} onChange={setNoticePrice} className="w-40" />
                  <span>× 1.1 =</span>
                  {helped ? (
                    <span className="tabular-nums">
                      {num(helped.raw, 2)} → <b className="font-semibold">{won(helped.rounded)}</b>(원 단위 반올림)
                    </span>
                  ) : (
                    <span className="text-[#3f3f4e]">사용단가를 넣으면 계산돼요</span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {helped && (
                    <Button type="button" size="sm" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={() => setForm({ unitPrice: String(helped.rounded) })}>
                      {won(helped.rounded)} 쓰기
                    </Button>
                  )}
                  {kepco.prevUnitPrice !== null && (
                    <Button type="button" size="sm" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={() => setForm({ unitPrice: String(kepco.prevUnitPrice) })}>
                      지난달 값 {unitWon(kepco.prevUnitPrice)} 쓰기
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 3. 고급 설정 */}
          <details className="group rounded-md border border-warm-tan" open={!!fieldErrors.areaPct || undefined}>
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[15px] text-dark [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 shrink-0 text-text-secondary group-open:rotate-90" aria-hidden />
              고급 설정 · 면적별 배분율 {form.areaPct ?? "-"}%
            </summary>
            <div className="grid gap-1.5 border-t border-warm-tan px-3 py-3">
              <Label htmlFor="f-areaPct" className="text-base">
                면적별 배분율
              </Label>
              <UnitInput id="f-areaPct" unit="%" value={form.areaPct} onChange={(v) => setForm({ areaPct: v })} {...ro} {...err("areaPct")} className={cn("max-w-[10rem]", roClass)} />
              <FieldErr id="f-areaPct-error">{fieldErrors.areaPct}</FieldErr>
              <p className="text-sm text-text-secondary">공장동을 뺀 나머지 가운데 사무실 기업이 부담하는 비율이에요. 보통 70%예요.</p>
            </div>
          </details>
        </div>

        {/* 결과 3칸 */}
        <div className="border-t border-warm-tan px-4 py-4 sm:px-5">
          <h3 className="mb-2 text-base font-semibold text-dark">배분 결과</h3>
          {preview && alloc ? (
            <dl className="grid gap-2 sm:grid-cols-3">
              {[
                { label: "공장동(A)", value: preview.factoryA },
                { label: "사무실 기업(B)", value: alloc.officeB },
                { label: "센터(C)", value: alloc.centerC },
              ].map((c) => (
                <div key={c.label} className="rounded-md border border-warm-tan px-3 py-2">
                  <dt className="text-sm text-[#3f3f4e]">{c.label}</dt>
                  <dd className="text-lg font-semibold tabular-nums text-dark">
                    <Money value={c.value} tone={c.value < 0 ? "danger" : "default"} />
                  </dd>
                </div>
              ))}
            </dl>
          ) : metersBlock ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="text-[15px] text-[#3f3f4e] [word-break:keep-all]">아직 계산 전이에요. {metersBlock}.</p>
              <Button type="button" size="sm" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={onGoMeters}>
                1단계로 가기
              </Button>
            </div>
          ) : (
            <p className="text-[15px] text-[#3f3f4e]">아직 계산 전이에요. 한전 청구금액과 kWh 단가를 넣으면 계산돼요.</p>
          )}

          {/* 10평당 청구단가 확정 */}
          <div className="mt-4 grid gap-2">
            <p className="text-[15px] text-dark">
              10평당 청구단가 제안 <b className="font-semibold tabular-nums">{suggested === null ? "계산 전" : won(suggested)}</b>
            </p>
            {locked ? (
              <p className="text-[15px] text-[#3f3f4e]">
                확정단가 <b className="font-semibold text-dark">{saved.per10 === null ? "확정하지 않음" : won(saved.per10)}</b>
              </p>
            ) : saved.per10 === null && suggested === null ? (
              // 계산 전(검침 미저장 등)에는 확정 체크를 보이지 않는다 — 엉터리 제안값을 한 번에 확정 저장하지 않게
              <>
                <p className="text-[15px] text-[#3f3f4e] [word-break:keep-all]">
                  제안값이 계산되면 여기서 10평당 단가를 확정해요. 지금 저장하면 확정하지 않은 채로 저장돼요.
                </p>
                {form.per10Choice === "manual" && (
                  <div className="grid max-w-xs gap-1.5">
                    <Label htmlFor="f-per10" className="text-base">
                      10평당 청구단가(직접 입력)
                    </Label>
                    <WonInput id="f-per10" value={form.per10Manual} onChange={(v) => setForm({ per10Manual: v })} {...err("per10")} />
                  </div>
                )}
              </>
            ) : saved.per10 === null ? (
              <>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="per10-confirm"
                    checked={form.per10Choice === "suggested"}
                    onCheckedChange={(v) => setForm({ per10Choice: v === true ? "suggested" : "manual" })}
                  />
                  <Label htmlFor="per10-confirm" className="text-base font-normal">
                    제안값{suggested === null ? "" : ` ${won(suggested)}`}으로 확정
                  </Label>
                </div>
                {form.per10Choice === "manual" && (
                  <div className="grid max-w-xs gap-1.5">
                    <Label htmlFor="f-per10" className="text-base">
                      10평당 청구단가(직접 입력)
                    </Label>
                    <WonInput id="f-per10" value={form.per10Manual} onChange={(v) => setForm({ per10Manual: v })} {...err("per10")} />
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-[15px] text-[#3f3f4e] [word-break:keep-all]">
                  저장된 값 <b className="font-semibold text-dark">{won(saved.per10)}</b>
                  {per10Differs && <> · 지금 제안 {won(suggested)}(한전 금액·검침·계약 면적이 바뀌면 제안값도 바뀌어요)</>}
                </p>
                <RadioGroup
                  value={form.per10Choice}
                  onValueChange={(v) => setForm({ per10Choice: v as Step2Form["per10Choice"] })}
                  aria-label="10평당 청구단가"
                  className="gap-1.5"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="keep" id="per10-keep" />
                    <Label htmlFor="per10-keep" className="text-base font-normal">
                      저장된 값 그대로 쓰기
                    </Label>
                  </div>
                  {per10Differs && (
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="suggested" id="per10-suggested" />
                      <Label htmlFor="per10-suggested" className="text-base font-normal">
                        지금 제안값 {won(suggested)}으로 바꾸기
                      </Label>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="manual" id="per10-manual" />
                    <Label htmlFor="per10-manual" className="text-base font-normal">
                      직접 입력
                    </Label>
                  </div>
                </RadioGroup>
                {form.per10Choice === "manual" && (
                  <div className="grid max-w-xs gap-1.5">
                    <Label htmlFor="f-per10" className="text-base">
                      10평당 청구단가(직접 입력)
                    </Label>
                    <WonInput id="f-per10" value={form.per10Manual} onChange={(v) => setForm({ per10Manual: v })} {...err("per10")} />
                  </div>
                )}
              </>
            )}
            <FieldErr id="f-per10-error">{fieldErrors.per10}</FieldErr>
          </div>

          <p className="mt-3 text-[15px]">
            <span className="font-medium text-dark">검산 </span>
            {check}
          </p>

          {preview && alloc && (
            <details className="group mt-3 rounded-md border border-warm-tan">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[15px] text-dark [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 shrink-0 text-text-secondary group-open:rotate-90" aria-hidden />
                계산 근거 보기
              </summary>
              <ul className="space-y-1 border-t border-warm-tan px-4 py-3 text-[15px] leading-relaxed text-[#3f3f4e] [word-break:keep-all]">
                <li>
                  면적별 기업부담 = (한전 청구금액 − 공장동 A) × {form.areaPct ?? "-"}% = {won(Math.round(alloc.areaShare))}
                </li>
                <li>
                  사무실 합계 {num(pyeongSum, 1)}평 → 10평당 실계산 {num(alloc.per10Calc, 2)}원 → 10원 단위로 다듬은 제안 {won(alloc.per10Suggested)}
                </li>
                <li>사무실 기업(B) = 확정단가 {won(alloc.per10Billed)} × {num(pyeongSum, 1)}평 ÷ 10 = {won(alloc.officeB)}</li>
                <li>센터(C) = 한전 청구금액 − A − B = {won(alloc.centerC)}</li>
              </ul>
            </details>
          )}
        </div>
      </div>

      <StepHelp notes={BILLING_CLOSE_STEP_NOTES.allocation} className="mt-4" />

      {saveError && (
        <Notice tone="danger" title="배분을 저장하지 못했어요" className="mt-4">
          {saveError}
        </Notice>
      )}
      <StickyActionBar
        summary={locked ? "발행된 달이라 값을 바꿀 수 없어요" : dirty ? "저장 안 한 변경이 있어요" : saved.exists ? "저장된 값이에요" : "아직 저장한 값이 없어요"}
        secondary={
          <Button type="button" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={onPrev}>
            이전
          </Button>
        }
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
