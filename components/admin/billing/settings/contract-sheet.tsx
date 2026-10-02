"use client"

// 계약 시트(오른쪽) — 한 열 3묶음: ① 누가·어디 ② 얼마(단위 입력 + 즉석 계산) ③ 어떻게 청구(라디오 + 한 줄 설명) + 접힌 "다른 조건".
// 수정 모드에서 기업·호실은 읽기 전용 글자(API가 바꿔도 무시한다, ISS-114).
// 저장은 GET 행 전체에서 고친 칸만 바꿔 보낸다(PUT 전체 덮어쓰기 대비, 가드 #21 — contract-sheet-model.ts).
// 저장하면 시트 안에 "저장했어요"와, 작성 중 청구서가 있으면 월 마감 3단계로 가는 길을 남긴다.

import Link from "next/link"
import { useId, useRef, useState, type ReactNode } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import {
  BusyButton,
  DetailSheet,
  ErrorSummary,
  Notice,
  SearchCombobox,
  StatusBadge,
  UnitInput,
  WonInput,
  useConfirm,
  useFieldErrors,
} from "@/components/saas"
import { billMonthShort, date, num, won } from "@/lib/format"
import { GLOSSARY } from "@/lib/glossary"
import { billingCloseHref, roomsHref, tenantsHref } from "@/lib/links"
import { MSG, friendlyError } from "@/lib/messages"
import type { Unit } from "@/components/saas/unit-input"
import {
  ELEC_OPTIONS,
  FIRST_MONTH_OPTIONS,
  NEW_CONTRACT_FORM,
  RENEWAL_OPTIONS,
  buildCreateBody,
  buildPutBody,
  chargePreview,
  formFromRow,
  isFormDirty,
  validateContractForm,
  type ContractErrorKey,
  type ContractForm,
  type ContractRow,
  type EditableKey,
} from "./contract-sheet-model"
import type { DraftBillsInfo } from "./billing-settings"
import { MGMT_FIELD_HINT, RENT_RULE_TEXT } from "./rate-rules"
import { errorDetail, sendJson, type RoomRow, type TenantRow } from "./types"

const LABELS: Record<ContractErrorKey, string> = {
  tenant: "기업",
  room: "호실",
  pyeong_billed: "부과 면적",
  rent_unit_price: "평당 임대료",
  mgmt_fee: "관리비",
}

export function ContractSheet({
  open,
  onOpenChange,
  row,
  tenants,
  rooms,
  optionsFailed = false,
  retryingOptions = false,
  onRetryOptions,
  draftBills,
  justSaved = false,
  onSaved,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null이면 새 계약 */
  row: ContractRow | null
  tenants: TenantRow[]
  rooms: RoomRow[]
  /** 기업·호실 목록(직접 추가용)을 불러오지 못했으면 true — 시트 안에 알림 + 다시 시도 */
  optionsFailed?: boolean
  retryingOptions?: boolean
  onRetryOptions?: () => void
  draftBills: DraftBillsInfo | null
  /** 방금 만든 계약을 열 때 "저장했어요"를 처음부터 보인다 */
  justSaved?: boolean
  onSaved: () => void
  onCreated: (id: number) => void
}) {
  const mode = row ? "edit" : "create"
  const [baseline, setBaseline] = useState<ContractForm>(() => (row ? formFromRow(row) : { ...NEW_CONTRACT_FORM }))
  const [form, setForm] = useState<ContractForm>(baseline)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // 닫기 판단은 확인창을 기다리는 동안에도 최신 값을 봐야 해서 ref로도 둔다
  const savingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(justSaved)
  const [moreOpen, setMoreOpen] = useState(() => !!(row && (row.memo || row.contract_date)))
  const fe = useFieldErrors(LABELS)
  const ask = useConfirm()

  const dirty = isFormDirty(baseline, form) || (mode === "create" && (!!tenantId || !!roomId))
  const set = (k: EditableKey, v: string | null) => {
    setForm((f) => ({ ...f, [k]: v === "" ? null : v }))
    if (k in LABELS) fe.clear(k as ContractErrorKey)
  }
  const preview = chargePreview(form)

  const save = async () => {
    if (savingRef.current) return
    setError(null)
    if (!fe.check(validateContractForm(form, { mode, tenantId, roomId }))) return
    savingRef.current = true
    setSaving(true)
    try {
      if (row) {
        const r = await sendJson("/api/admin/contracts", "PUT", buildPutBody(row, form))
        if (!r.ok) {
          setError(friendlyError(r.status, r.error, MSG.saveFailed))
          return
        }
        setBaseline(form)
        setSaved(true)
        onSaved()
      } else {
        const r = await sendJson<{ id: number }>("/api/admin/contracts", "POST", buildCreateBody(form, tenantId!, roomId!))
        if (!r.ok || !r.data) {
          setError(friendlyError(r.status, r.error, MSG.saveFailed))
          return
        }
        setBaseline(form)
        onCreated(r.data.id)
      }
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  // 저장 중에는 어떤 길(X·바깥·[닫기])로도 닫지 않는다 — 실패하면 오류를 시트 안에서 보여야 한다
  const closeIfIdle = (o: boolean) => {
    if (!o && savingRef.current) return
    onOpenChange(o)
  }

  // 아래 [닫기]도 위 X·바깥 클릭과 같게: 저장하지 않은 변경이 있으면 먼저 묻는다(DetailSheet와 같은 문구)
  const requestClose = async () => {
    if (savingRef.current) return
    if (dirty) {
      const ok = await ask({
        title: "저장하지 않은 변경이 있어요. 닫을까요?",
        body: "닫으면 고친 내용이 사라져요.",
        confirmLabel: "저장하지 않고 닫기",
        cancelLabel: "계속 고치기",
        tone: "danger",
      })
      if (!ok) return
    }
    closeIfIdle(false)
  }

  const title = row ? `${row.tenant_name} · ${row.room_code} 계약` : "계약 직접 추가"
  const showSaved = saved && !dirty
  const ended = !!row && row.status !== "active"
  const draftHint = draftBills && draftBills.count > 0 && !ended ? draftBills : null
  const description = !row
    ? "새 입주라면 호실 현황의 입주 처리가 더 쉬워요"
    : ended
      ? "종료한 계약이에요. 고쳐도 이미 만든 청구서는 바뀌지 않아요"
      : "계약 조건을 고치면 다음에 만드는 청구서부터 들어가요"

  return (
    <DetailSheet
      open={open}
      onOpenChange={closeIfIdle}
      title={title}
      description={description}
      badge={row && row.status !== "active" ? <StatusBadge domain="contract" status={row.status} detail={row.ended_at ? `${date(row.ended_at)} 종료` : undefined} /> : undefined}
      dirty={dirty && !saving}
      size="md"
      footer={
        <>
          <Button type="button" variant="outline" className="hover:bg-warm-beige" disabled={saving} onClick={() => void requestClose()}>
            닫기
          </Button>
          <BusyButton type="button" busy={saving} onClick={save}>
            {row ? "저장하기" : "계약 추가하기"}
          </BusyButton>
        </>
      }
    >
      <div className="space-y-6">
        {showSaved && (
          <Notice
            tone="success"
            title="저장했어요"
            action={
              draftHint ? (
                <Button asChild size="sm" variant="outline" className="hover:bg-warm-beige">
                  <Link href={billingCloseHref(draftHint.usageMonth, 3)}>
                    월 마감 3단계로
                    <ChevronRight aria-hidden />
                  </Link>
                </Button>
              ) : undefined
            }
          >
            {draftHint
              ? `${billMonthShort(draftHint.billMonth)} 청구서(작성 중 ${draftHint.count}건)에 넣으려면 월 마감 3단계에서 청구서를 다시 만들어요. 이미 발행한 청구서는 바뀌지 않아요.`
              : ended
                ? "이미 만든 청구서는 바뀌지 않아요."
                : "다음에 만드는 청구서부터 들어가요. 이미 발행한 청구서는 바뀌지 않아요."}
          </Notice>
        )}
        {error && (
          <Notice tone="danger" title="저장하지 못했어요">
            {errorDetail(error, "저장하지 못했어요")}
          </Notice>
        )}
        <ErrorSummary errors={fe.summary} />

        {/* ① 누가·어디 */}
        <Group title="누가·어디">
          {row ? (
            <>
              <dl className="grid gap-2 text-base">
                <ReadRow label="기업">
                  {row.tenant_name}
                  <Link href={tenantsHref({ tenant: row.tenant_id, card: "contract" })} className="ml-2 text-[15px] text-link underline underline-offset-2 hover:text-dark">
                    기업 카드 보기
                  </Link>
                </ReadRow>
                <ReadRow label="호실">
                  {row.room_code}
                  {row.building ? <span className="text-text-secondary">({row.building})</span> : null}
                  <Link href={roomsHref({ room: row.room_code })} className="ml-2 text-[15px] text-link underline underline-offset-2 hover:text-dark">
                    호실 현황에서 보기
                  </Link>
                </ReadRow>
              </dl>
              <p className="text-[15px] leading-relaxed text-text-secondary [word-break:keep-all]">
                기업·호실은 여기서 바꿀 수 없어요. 호실을 옮기려면 호실 현황에서 퇴실 처리한 뒤 새 호실에 입주 처리해요.
              </p>
            </>
          ) : (
            <>
              {optionsFailed && (
                <Notice
                  tone="danger"
                  title="기업·호실 목록을 불러오지 못했어요"
                  action={
                    onRetryOptions ? (
                      <BusyButton type="button" size="sm" variant="outline" className="hover:bg-warm-beige" busy={retryingOptions} busyLabel={MSG.busyLoad} onClick={onRetryOptions}>
                        {MSG.retry}
                      </BusyButton>
                    ) : undefined
                  }
                >
                  {MSG.network}
                </Notice>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor={fe.fieldId("tenant")} className="text-base">
                  기업
                </Label>
                <SearchCombobox
                  id={fe.fieldId("tenant")}
                  items={tenants.map((t) => ({ value: String(t.id), label: t.name }))}
                  value={tenantId}
                  onSelect={(v) => {
                    setTenantId(v)
                    fe.clear("tenant")
                  }}
                  placeholder="기업 이름으로 찾기"
                  emptyText={optionsFailed && tenants.length === 0 ? "기업 목록을 불러오지 못했어요" : "맞는 기업이 없어요. 입주기업 화면에서 먼저 등록해요"}
                  invalid={!!fe.errors.tenant}
                  aria-describedby={fe.errors.tenant ? fe.errorId("tenant") : undefined}
                />
                {fe.errors.tenant && <FieldError id={fe.errorId("tenant")}>{fe.errors.tenant}</FieldError>}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={fe.fieldId("room")} className="text-base">
                  호실
                </Label>
                <SearchCombobox
                  id={fe.fieldId("room")}
                  items={rooms.map((r) => ({
                    value: String(r.id),
                    label: r.code,
                    hint: [r.building, r.pyeong != null ? `${num(r.pyeong, 1)}평` : null, r.tenant_name ? `${r.tenant_name} 입주 중` : "공실"].filter(Boolean).join(" · "),
                  }))}
                  value={roomId}
                  onSelect={(v) => {
                    setRoomId(v)
                    fe.clear("room")
                    const room = rooms.find((r) => String(r.id) === v)
                    // 부과 면적이 비어 있을 때만 호실 면적을 채운다(입력한 값은 덮어쓰지 않는다)
                    if (room && room.pyeong != null && form.pyeong_billed === null) set("pyeong_billed", String(room.pyeong))
                  }}
                  placeholder="호실 코드로 찾기"
                  emptyText={optionsFailed && rooms.length === 0 ? "호실 목록을 불러오지 못했어요" : "맞는 호실이 없어요"}
                  invalid={!!fe.errors.room}
                  aria-describedby={fe.errors.room ? fe.errorId("room") : undefined}
                />
                {fe.errors.room && <FieldError id={fe.errorId("room")}>{fe.errors.room}</FieldError>}
              </div>
              <p className="text-[15px] leading-relaxed text-text-secondary [word-break:keep-all]">
                새 입주라면{" "}
                <Link href={roomsHref({ state: "vacant" })} className="text-link underline underline-offset-2 hover:text-dark">
                  호실 현황
                </Link>
                에서 입주 처리하면 첫 달 청구까지 한 번에 정해요.
              </p>
            </>
          )}
        </Group>

        {/* ② 얼마 */}
        <Group title="얼마">
          <NumField
            k="pyeong_billed"
            label="부과 면적"
            unit="평"
            hint={GLOSSARY.pyeongBilled.hint}
            value={form.pyeong_billed}
            onChange={(v) => set("pyeong_billed", v)}
            fe={fe}
          />
          <NumField
            k="rent_unit_price"
            label="평당 임대료"
            unit="원/평"
            hint={RENT_RULE_TEXT}
            value={form.rent_unit_price}
            onChange={(v) => set("rent_unit_price", v)}
            fe={fe}
          />
          <NumField
            k="mgmt_fee"
            label="관리비"
            unit="원/월"
            hint={MGMT_FIELD_HINT}
            value={form.mgmt_fee}
            onChange={(v) => set("mgmt_fee", v)}
            fe={fe}
          />
          <NumField
            k="deposit_actual"
            label="받은 보증금"
            unit="원"
            hint={GLOSSARY.depositActual.hint}
            value={form.deposit_actual}
            onChange={(v) => set("deposit_actual", v)}
          />
          <div role="status" aria-live="polite" className="rounded-md border border-warm-tan bg-warm-ivory px-3 py-2.5 text-base text-dark [word-break:keep-all]">
            {preview ? (
              <>
                <p>
                  월 임대료 = {num(preview.pyeong, 1)}평 × {won(preview.unit)} = <strong className="tabular-nums">{won(preview.rent)}</strong>
                </p>
                <p className="mt-0.5">
                  관리비 {won(preview.mgmt)} · 한 달 합계 <strong className="tabular-nums">{won(preview.gross)}</strong>
                  <span className="text-text-secondary">(부가세 포함, 전기료 별도)</span>
                </p>
                <p className="mt-1 text-sm text-text-secondary">청구서에 이렇게 찍혀요</p>
              </>
            ) : (
              <p className="text-text-secondary">부과 면적과 평당 임대료를 넣으면 월 임대료를 바로 계산해 보여 줘요.</p>
            )}
          </div>
        </Group>

        {/* ③ 어떻게 청구 */}
        <Group title="어떻게 청구">
          <Choice
            legend="계약 구분"
            name="renewal_type"
            options={RENEWAL_OPTIONS}
            value={form.renewal_type ?? "renewal"}
            onChange={(v) => set("renewal_type", v)}
          />
          <Choice legend="전기료" name="elec_method" options={ELEC_OPTIONS} value={form.elec_method ?? "area"} onChange={(v) => set("elec_method", v)} />
          <Choice
            legend="입주한 달 청구"
            name="first_month_billing"
            options={FIRST_MONTH_OPTIONS}
            value={form.first_month_billing ?? "full"}
            onChange={(v) => set("first_month_billing", v)}
            note="입주한 달 청구서에는 전기료(지난달 사용분)가 빠져요"
          />
          <div className="grid gap-1.5">
            <Label htmlFor="contract-start" className="text-base">
              입주일
            </Label>
            <Input
              id="contract-start"
              type="date"
              value={form.start_date ?? ""}
              onChange={(e) => set("start_date", e.target.value)}
              className="w-full bg-card text-base sm:w-52"
              aria-describedby="contract-start-hint"
            />
            <p id="contract-start-hint" className="text-sm text-text-secondary">
              날짜만큼(일할) 청구할 때 이 날짜부터 셈해요
            </p>
          </div>
        </Group>

        {/* 다른 조건(접힘) — 화면에 잘 안 쓰는 칸도 저장할 때 원래 값이 그대로 간다 */}
        <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" className="-ml-2 h-auto min-h-9 max-w-full justify-start whitespace-normal px-2 text-left text-base font-semibold text-dark hover:bg-warm-beige">
              <ChevronDown className={moreOpen ? "rotate-180" : ""} aria-hidden />
              다른 조건(실제 면적·기준 보증금·계약일·메모)
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-4">
            <NumField
              k="pyeong_actual"
              label="실제 면적"
              unit="평"
              hint="비우면 부과 면적과 같게 저장돼요"
              value={form.pyeong_actual}
              onChange={(v) => set("pyeong_actual", v)}
            />
            <NumField
              k="deposit_standard"
              label="기준 보증금"
              unit="원"
              hint="비우면 실제 면적 × 평당 20만 원으로 저장돼요"
              value={form.deposit_standard}
              onChange={(v) => set("deposit_standard", v)}
            />
            <div className="grid gap-1.5">
              <Label htmlFor="contract-date" className="text-base">
                계약일
              </Label>
              <Input
                id="contract-date"
                type="date"
                value={form.contract_date ?? ""}
                onChange={(e) => set("contract_date", e.target.value)}
                className="w-full bg-card text-base sm:w-52"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="contract-memo" className="text-base">
                메모
              </Label>
              <Textarea id="contract-memo" value={form.memo ?? ""} onChange={(e) => set("memo", e.target.value)} rows={3} className="bg-card text-base" />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </DetailSheet>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="border-b border-warm-tan pb-1.5 text-base font-semibold text-dark">{title}</h3>
      {children}
    </section>
  )
}

function ReadRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-2">
      <dt className="text-[#3f3f4e]">{label}</dt>
      <dd className="min-w-0 font-medium text-dark [word-break:keep-all]">{children}</dd>
    </div>
  )
}

type FieldErrors = ReturnType<typeof useFieldErrors<ContractErrorKey>>

function NumField({
  k,
  label,
  unit,
  hint,
  value,
  onChange,
  fe,
}: {
  k: EditableKey
  label: string
  unit: Unit
  hint?: string
  value: string | null
  onChange: (v: string | null) => void
  /** 검사 대상 칸이면 넘긴다(칸 id·오류 연결) */
  fe?: FieldErrors
}) {
  const ownId = useId()
  const errKey = fe && (k as string) in LABELS ? (k as ContractErrorKey) : null
  const id = errKey && fe ? fe.fieldId(errKey) : `${ownId}-${k}`
  const hintId = `${id}-hint`
  const err = errKey && fe ? fe.errors[errKey] : undefined
  const describedBy = [hint ? hintId : null, err && errKey && fe ? fe.errorId(errKey) : null].filter(Boolean).join(" ") || undefined
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-base">
        {label}
      </Label>
      {unit === "원" ? (
        <WonInput id={id} value={value} onChange={onChange} invalid={!!err} aria-describedby={describedBy} className="w-full sm:w-60" />
      ) : (
        <UnitInput id={id} unit={unit} value={value} onChange={onChange} invalid={!!err} aria-describedby={describedBy} className="w-full sm:w-60" />
      )}
      {hint && (
        <p id={hintId} className="text-sm text-text-secondary [word-break:keep-all]">
          {hint}
        </p>
      )}
      {err && errKey && fe && <FieldError id={fe.errorId(errKey)}>{err}</FieldError>}
    </div>
  )
}

function Choice({
  legend,
  name,
  options,
  value,
  onChange,
  note,
}: {
  legend: string
  name: string
  options: readonly { value: string; label: string; hint: string }[]
  value: string
  onChange: (v: string) => void
  note?: string
}) {
  const id = useId()
  return (
    <fieldset className="grid gap-2">
      <legend id={`${id}-legend`} className="mb-1.5 text-base font-medium text-dark">
        {legend}
      </legend>
      <RadioGroup value={value} onValueChange={onChange} aria-labelledby={`${id}-legend`} name={name} className="gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            htmlFor={`${id}-${o.value}`}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-warm-tan bg-card px-3 py-2.5 hover:bg-warm-ivory has-[[data-state=checked]]:border-dark"
          >
            <RadioGroupItem id={`${id}-${o.value}`} value={o.value} className="mt-1 border-[#6b6b7b]" />
            <span className="min-w-0">
              <span className="block text-base font-medium text-dark">{o.label}</span>
              <span className="block text-sm text-text-secondary [word-break:keep-all]">{o.hint}</span>
            </span>
          </label>
        ))}
      </RadioGroup>
      {note && <p className="text-sm text-text-secondary">{note}</p>}
    </fieldset>
  )
}
