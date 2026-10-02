"use client"

// 입주 처리 폼(공실 시트 안, 계획서 4.3.3). 한 열 3묶음: ① 누가·언제 ② 얼마 ③ 어떻게 청구.
// 기존 API만 순서대로 조합한다: (새 기업이면) POST /api/admin/tenants → POST /api/admin/contracts → (안내용) GET bills?period=.
// - 제출할 때 한 번에 검증(팝업 없음): 칸 아래 오류 + 2개 이상이면 오류 요약, 첫 칸 포커스. 버튼은 처리 중에만 잠근다(가드 #7).
// - 첫 달 기본 "한 달 전액"(full), 계약 구분 기본 'new'(신규 입주) — 지금과 같다(가드 #26).
// - 새 기업은 한 번만 만든다: 계약 저장이 실패해도 만든 기업을 선택된 상태로 남겨 다시 눌러도 기업이 두 번 생기지 않는다.
// - 저장 직전에 보드를 다시 읽어 이 호실이 여전히 공실인지 확인한다(계약 POST는 같은 호실 진행 중 계약을 막지 않는다).

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { FieldError } from "@/components/ui/field"
import {
  BusyButton,
  ErrorSummary,
  Notice,
  ResultCard,
  SearchCombobox,
  StickyActionBar,
  UnitInput,
  WonInput,
  toastSuccess,
  useConfirm,
  useFieldErrors,
} from "@/components/saas"
import { GLOSSARY } from "@/lib/glossary"
import { billingCloseHrefForBillMonth, tenantsHref } from "@/lib/links"
import { friendlyError } from "@/lib/messages"
import { billMonthShort, date, won } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  FIRST_MONTH_LABEL,
  MOVE_IN_LABELS,
  baseRates,
  findSameNameTenants,
  firstBillNotice,
  isAfterThisMonth,
  isFactory,
  isMonthIssued,
  mapTenantFieldErrors,
  monthlyCharge,
  monthlyText,
  moveInDefaults,
  moveInPayload,
  newTenantPayload,
  proratedEstimate,
  pyeongText,
  standardDeposit,
  validateMoveIn,
  type BoardRoom,
  type MonthBilling,
  type MoveInField,
  type MoveInForm as MoveInFormValues,
} from "./move-model"

export interface TenantOption {
  id: number
  name: string
  /** 기업 상태. 퇴실한 기업도 목록에 넣어 다시 들어올 때 새로 만들지 않게 한다 */
  status?: "active" | "moved_out"
}

interface MoveInResult {
  tenantId: number
  tenantName: string
  startDate: string
  gross: number | null
  firstMonth: MonthBilling
  notice: ReturnType<typeof firstBillNotice>
  ym: string
  /** 입주일이 다음 달 이후인 채로 저장했는가(폼의 미래 입주일 경고를 완료 카드에도 다시 보인다) */
  futureStart: boolean
  /** 고른 기업이 ‘퇴실’ 상태였는가(기업 상태를 ‘입주 중’으로 바꾸라는 안내) */
  wasMovedOut: boolean
}

/** 묶음 제목(① 누가 · 언제) */
function Group({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 border-t border-warm-tan pt-4 first:border-t-0 first:pt-0">
      <legend className="mb-1 text-base font-semibold text-dark">
        <span aria-hidden className="mr-1.5 tabular-nums">{n}</span>
        {title}
      </legend>
      {children}
    </fieldset>
  )
}

function Hint({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="text-sm leading-relaxed text-text-secondary [word-break:keep-all]">
      {children}
    </p>
  )
}

export function MoveInForm({
  room,
  tenants,
  tenantsError,
  onRetryTenants,
  tenantRooms,
  onTenantCreated,
  onReload,
  onDone,
  onCancel,
  onDirtyChange,
}: {
  room: BoardRoom
  tenants: TenantOption[] | null
  tenantsError: boolean
  onRetryTenants: () => void
  tenantRooms: Map<number, string[]>
  onTenantCreated: (t: TenantOption) => void
  onReload: () => Promise<BoardRoom[] | null>
  onDone: () => void
  onCancel: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const router = useRouter()
  const ask = useConfirm()
  const initial = useMemo(() => moveInDefaults(room), [room.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState<MoveInFormValues>(initial)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [newTenant, setNewTenant] = useState<{ name: string; businessNo: string; email: string } | null>(null)
  const [createdTenant, setCreatedTenant] = useState<TenantOption | null>(null)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [result, setResult] = useState<MoveInResult | null>(null)
  const fe = useFieldErrors<MoveInField>(MOVE_IN_LABELS)
  const rates = baseRates(room.building)

  const dirty =
    !result &&
    (tenantId !== null || newTenant !== null || JSON.stringify(form) !== JSON.stringify(initial))
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  const set = <K extends keyof MoveInFormValues>(k: K, v: MoveInFormValues[K], field?: MoveInField) => {
    setForm((f) => ({ ...f, [k]: v }))
    if (field) fe.clear(field)
  }

  const monthly = monthlyCharge(form.pyeong_billed, form.rent_unit_price, form.mgmt_fee)
  const firstEst = proratedEstimate("first", form.start_date, { pyeong: form.pyeong_billed, rent: form.rent_unit_price, mgmt: form.mgmt_fee })
  const stdDeposit = standardDeposit(form.pyeong_billed)
  const futureStart = isAfterThisMonth(form.start_date)
  const roomPyeong = pyeongText(room.pyeong)

  const items = (tenants ?? []).map((t) => {
    const codes = tenantRooms.get(t.id)
    const hint = codes && codes.length > 0 ? `${codes.join("·")}호 사용 중` : t.status === "moved_out" ? "퇴실한 기업" : "호실 없음"
    return { value: String(t.id), label: t.name, hint }
  })
  const chosen = !createdTenant && tenantId ? tenants?.find((t) => String(t.id) === tenantId) ?? null : null
  // 새 기업 이름이 기존 기업(퇴실 포함)과 같은가(‘(주)’·띄어쓰기 무시) — 중복 등록을 막지는 않고 알려 준다
  const sameName = newTenant && !createdTenant ? findSameNameTenants(newTenant.name, tenants) : []
  const pyeongFromRoom = room.pyeong != null && form.pyeong_billed !== null && form.pyeong_billed !== "" && form.pyeong_billed === initial.pyeong_billed

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (busy) return
    setServerError(null)
    const pendingNew = createdTenant ? null : newTenant
    const errs = validateMoveIn(form, { tenantId: createdTenant ? String(createdTenant.id) : tenantId, newTenant: pendingNew })
    if (!fe.check(errs)) return

    setBusy(true)
    try {
      // 1) 지금도 공실인지 다시 확인(계약 POST는 같은 호실 진행 중 계약을 막지 않는다)
      const fresh = await onReload()
      if (!fresh) {
        setServerError("호실 상태를 확인하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.")
        return
      }
      const now = fresh.find((r) => r.id === room.id)
      if (!now || now.state !== "vacant") {
        setServerError(`${room.code}호는 지금 공실이 아니에요. 다른 곳에서 이미 입주 처리를 했을 수 있어요. 호실 정보를 확인해 주세요.`)
        return
      }

      // 2) 새 기업이면 먼저 등록(한 번만)
      let tid = createdTenant ? createdTenant.id : Number(tenantId)
      let tname = createdTenant ? createdTenant.name : tenants?.find((t) => t.id === tid)?.name ?? ""
      if (pendingNew) {
        const res = await fetch("/api/admin/tenants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(newTenantPayload(pendingNew, form.start_date, room.code)),
        })
        const d = await res.json().catch(() => null)
        if (!res.ok || !d?.success) {
          const mapped = mapTenantFieldErrors(d?.field_errors)
          if (Object.keys(mapped).length > 0) fe.setErrors(mapped)
          else setServerError(`새 기업을 등록하지 못했어요. ${friendlyError(res.status, d?.error, "").trim()}`.trim())
          return
        }
        const created: TenantOption = { id: Number(d.tenant.id), name: String(d.tenant.name) }
        setCreatedTenant(created)
        onTenantCreated(created)
        setTenantId(String(created.id))
        setNewTenant(null)
        tid = created.id
        tname = created.name
      }

      // 3) 계약 저장
      const res = await fetch("/api/admin/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(moveInPayload(form, room.id, tid)),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok || !d?.success) {
        const base = friendlyError(res.status, d?.error)
        setServerError(pendingNew || createdTenant ? `${base} ‘${tname}’는 입주기업에 등록됐어요. 다시 누르면 계약만 저장해요.` : base)
        return
      }

      // 4) 첫 청구 안내(사실대로): 입주일이 속한 청구월에 정기 청구서가 이미 발행됐는가
      const ym = form.start_date.slice(0, 7)
      let monthIssued: boolean | null = null
      try {
        const br = await fetch(`/api/admin/billing/bills?period=${ym}`, { credentials: "include", cache: "no-store" })
        const bd = await br.json().catch(() => null)
        if (br.ok && bd?.success) monthIssued = isMonthIssued(bd.bills ?? [])
      } catch {
        monthIssued = null
      }
      const estimate = form.first_month_billing === "prorated" ? firstEst?.amount ?? null : monthly?.gross ?? null
      setResult({
        tenantId: tid,
        tenantName: tname,
        startDate: form.start_date,
        gross: monthly?.gross ?? null,
        firstMonth: form.first_month_billing,
        notice: firstBillNotice({ startDate: form.start_date, monthIssued, firstMonth: form.first_month_billing, estimate }),
        ym,
        futureStart,
        wasMovedOut: !pendingNew && !createdTenant && tenants?.find((t) => t.id === tid)?.status === "moved_out",
      })
      fe.clear()
      toastSuccess(`${room.code}호 입주를 등록했어요`)
      onDone()
      void onReload()
      router.refresh()
    } catch {
      setServerError(friendlyError(0))
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    if (dirty) {
      const ok = await ask({
        title: "입력한 내용을 버리고 닫을까요?",
        body: "닫으면 입주 처리 폼에 입력한 내용이 사라져요.",
        confirmLabel: "버리고 닫기",
        cancelLabel: "계속 입력하기",
        tone: "danger",
      })
      if (!ok) return
    }
    onDirtyChange(false)
    onCancel()
  }

  if (result) {
    const tenantLink = (card: "contact" | "overview") => tenantsHref({ tenant: result.tenantId, card })
    const copy = [
      `${room.code}호에 ${result.tenantName} 입주 처리를 마쳤어요`,
      `입주일 ${date(result.startDate)} · 매달 ${result.gross != null ? won(result.gross) : "-"}(부가세 포함, 전기료 별도) · 첫 달 ${FIRST_MONTH_LABEL[result.firstMonth]}`,
      result.notice.text,
    ].join("\n")
    return (
      <div className="space-y-4">
        {result.futureStart && (
          <Notice tone="warning">
            입주일({date(result.startDate)})이 다음 달 이후예요. 입주 전 달 청구서에도 임대료가 들어갈 수 있으니, 월 마감 3단계에서 이 기업 청구서를 확인해 주세요.
          </Notice>
        )}
        {result.wasMovedOut && (
          <Notice tone="info">‘{result.tenantName}’는 기업 상태가 ‘퇴실’이에요. 기업 카드에서 ‘입주 중’으로 바꿔야 포털에 로그인할 수 있어요.</Notice>
        )}
        <ResultCard
          title={`${room.code}호에 ${result.tenantName} 입주 처리를 마쳤어요`}
          rows={[
            { label: "입주일", value: date(result.startDate) },
            { label: "매달 청구", value: result.gross != null ? `${won(result.gross)}(부가세 포함, 전기료 별도)` : "-" },
            { label: "첫 달", value: FIRST_MONTH_LABEL[result.firstMonth] },
          ]}
          notes={[result.notice.text, "입주한 달 청구서에는 전기료가 붙지 않아요(전기료는 쓴 다음 달에 청구해요)"]}
          nextSteps={[
            ...(result.wasMovedOut ? [{ label: "기업 상태를 ‘입주 중’으로 바꾸기", href: tenantLink("overview") }] : []),
            ...(result.notice.kind === "issued"
              ? [{ label: "월 마감 3단계 열기(이 기업 청구서 만들기)", href: billingCloseHrefForBillMonth(result.ym, 3) }]
              : []),
            { label: "포털 계정 만들기", href: tenantLink("contact") },
            { label: "청구서 받을 메일 확인", href: tenantLink("contact") },
            { label: "사업자번호·대표자 채우기", href: tenantLink("overview") },
          ]}
          copyText={copy}
          actions={
            <Button type="button" variant="ghost" size="sm" className="hover:bg-warm-beige hover:text-dark" onClick={onCancel}>
              호실 정보 보기
            </Button>
          }
        />
      </div>
    )
  }

  const errText = (k: MoveInField) => (
    <FieldError id={fe.errorId(k)} className="text-[15px]">
      {fe.errors[k]}
    </FieldError>
  )

  return (
    <form noValidate onSubmit={submit} aria-label={`${room.code}호 입주 처리`} className="space-y-5">
      <h3 className="text-lg font-semibold text-dark">
        {room.building} {room.code}호에 입주 처리
      </h3>
      <ErrorSummary errors={fe.summary} title={`입력하지 않았거나 확인할 칸이 ${fe.summary.length}개 있어요`} />
      {serverError && <Notice tone="danger">{serverError}</Notice>}

      <Group n="①" title="누가 · 언제">
        <div className="space-y-1.5">
          <Label htmlFor={fe.fieldId("tenant")} className="text-base font-medium">
            입주 기업
          </Label>
          <SearchCombobox
            id={fe.fieldId("tenant")}
            items={items}
            value={createdTenant ? String(createdTenant.id) : tenantId}
            onSelect={(v) => {
              if (createdTenant) return
              setTenantId(v)
              setNewTenant(null)
              fe.clear("tenant")
            }}
            onCreate={
              createdTenant
                ? undefined
                : (text) => {
                    setNewTenant({ name: text, businessNo: "", email: "" })
                    setTenantId(null)
                    fe.clear("tenant")
                    requestAnimationFrame(() => document.getElementById(fe.fieldId("businessNo"))?.focus())
                  }
            }
            createLabel={(t) => `‘${t}’ 새 기업으로 등록`}
            placeholder={newTenant ? "새 기업으로 등록해요(아래 칸)" : "기업 이름을 입력해 주세요"}
            emptyText="맞는 기업이 없어요"
            invalid={!!fe.errors.tenant}
            disabled={!!createdTenant}
            aria-describedby={fe.errors.tenant ? fe.errorId("tenant") : "movein-tenant-hint"}
          />
          {errText("tenant")}
          {createdTenant ? (
            <Hint id="movein-tenant-hint">‘{createdTenant.name}’를 입주기업에 새로 등록했어요. 계약 저장만 남았어요.</Hint>
          ) : chosen?.status === "moved_out" ? (
            <Hint id="movein-tenant-hint">퇴실한 기업이에요. 입주 처리 뒤 기업 카드에서 상태를 ‘입주 중’으로 바꿔 주세요.</Hint>
          ) : (
            <Hint id="movein-tenant-hint">입주기업에 없으면 이름을 입력해 바로 등록할 수 있어요. 퇴실한 기업도 목록에 있어요.</Hint>
          )}
          {tenantsError && (
            <Notice
              tone="warning"
              action={
                <Button type="button" variant="outline" size="sm" className="hover:bg-warm-beige hover:text-dark" onClick={onRetryTenants}>
                  다시 시도
                </Button>
              }
            >
              기업 목록을 불러오지 못했어요. 이미 등록된 기업인지 확인할 수 없으니, 다시 시도해 목록에서 먼저 찾아 주세요.
            </Notice>
          )}
        </div>

        {newTenant && !createdTenant && (
          <div className="space-y-3 rounded-md border border-warm-tan bg-warm-ivory/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[15px] font-semibold text-dark">새 기업으로 등록</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-link underline hover:bg-warm-beige"
                onClick={() => {
                  setNewTenant(null)
                  fe.clear("newName")
                  fe.clear("businessNo")
                  fe.clear("billEmail")
                }}
              >
                기존 기업에서 고르기
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={fe.fieldId("newName")} className="text-base font-medium">
                기업 이름
              </Label>
              <Input
                {...fe.field("newName")}
                value={newTenant.name}
                onChange={(e) => {
                  setNewTenant({ ...newTenant, name: e.target.value })
                  fe.clear("newName")
                }}
                className="h-10 bg-card text-base md:text-base"
              />
              {errText("newName")}
              {sameName.length > 0 && (
                <Notice
                  tone="warning"
                  action={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="hover:bg-warm-beige hover:text-dark"
                      onClick={() => {
                        setTenantId(String(sameName[0].id))
                        setNewTenant(null)
                        fe.clear("newName")
                        fe.clear("businessNo")
                        fe.clear("billEmail")
                        fe.clear("tenant")
                      }}
                    >
                      이 기업 고르기
                    </Button>
                  }
                >
                  이름이 같은 기업이 이미 있어요: ‘{sameName[0].name}’{sameName[0].status === "moved_out" ? "(퇴실한 기업)" : ""}. 같은 기업이면 새로 만들지 말고 골라 주세요.
                </Notice>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={fe.fieldId("businessNo")} className="text-base font-medium">
                사업자번호 <span className="font-normal text-text-secondary">(선택)</span>
              </Label>
              <Input
                {...fe.field("businessNo")}
                inputMode="numeric"
                placeholder="000-00-00000"
                value={newTenant.businessNo}
                onChange={(e) => {
                  setNewTenant({ ...newTenant, businessNo: e.target.value })
                  fe.clear("businessNo")
                }}
                className="h-10 bg-card text-base md:text-base"
              />
              {errText("businessNo")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={fe.fieldId("billEmail")} className="text-base font-medium">
                청구서 받을 메일 <span className="font-normal text-text-secondary">(선택)</span>
              </Label>
              <Input
                {...fe.field("billEmail")}
                type="email"
                inputMode="email"
                autoComplete="off"
                value={newTenant.email}
                onChange={(e) => {
                  setNewTenant({ ...newTenant, email: e.target.value })
                  fe.clear("billEmail")
                }}
                aria-describedby={fe.errors.billEmail ? fe.errorId("billEmail") : "movein-email-hint"}
                className="h-10 bg-card text-base md:text-base"
              />
              {errText("billEmail")}
              <Hint id="movein-email-hint">청구서 발행 메일을 받을 주소예요. 담당자 메일에도 같은 값을 넣어요.</Hint>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={fe.fieldId("start")} className="text-base font-medium">
            입주일
          </Label>
          <Input
            {...fe.field("start")}
            type="date"
            value={form.start_date}
            onChange={(e) => set("start_date", e.target.value, "start")}
            className="h-10 w-full bg-card text-base md:text-base sm:w-56"
          />
          {errText("start")}
          {futureStart && (
            <Notice tone="warning">
              입주일이 다음 달 이후예요. 지금 처리하면 입주 전 달 청구서에도 임대료가 들어갈 수 있어요. 입주하는 달에 처리해 주세요.
            </Notice>
          )}
        </div>
      </Group>

      <Group n="②" title="얼마">
        <div className="space-y-1.5">
          <Label htmlFor={fe.fieldId("pyeong")} className="text-base font-medium">
            부과 면적
          </Label>
          <UnitInput
            {...fe.field("pyeong")}
            unit="평"
            value={form.pyeong_billed}
            onChange={(v) => set("pyeong_billed", v, "pyeong")}
            invalid={!!fe.errors.pyeong}
            className="sm:w-56"
            aria-describedby={fe.errors.pyeong ? fe.errorId("pyeong") : "movein-pyeong-hint"}
          />
          {errText("pyeong")}
          <Hint id="movein-pyeong-hint">
            {pyeongFromRoom ? `호실 면적(${roomPyeong})으로 채웠어요. ` : ""}
            {GLOSSARY.pyeongBilled.hint}
          </Hint>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={fe.fieldId("rent")} className="text-base font-medium">
            평당 임대료
          </Label>
          <UnitInput
            {...fe.field("rent")}
            unit="원/평"
            value={form.rent_unit_price}
            onChange={(v) => set("rent_unit_price", v, "rent")}
            invalid={!!fe.errors.rent}
            className="sm:w-56"
            aria-describedby={fe.errors.rent ? fe.errorId("rent") : "movein-rent-hint"}
          />
          {errText("rent")}
          <Hint id="movein-rent-hint">{rates.hint}</Hint>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={fe.fieldId("mgmt")} className="text-base font-medium">
            관리비
          </Label>
          <UnitInput
            {...fe.field("mgmt")}
            unit="원/월"
            value={form.mgmt_fee}
            onChange={(v) => set("mgmt_fee", v, "mgmt")}
            invalid={!!fe.errors.mgmt}
            className="sm:w-56"
          />
          {errText("mgmt")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={fe.fieldId("deposit")} className="text-base font-medium">
            받은 보증금 <span className="font-normal text-text-secondary">(선택)</span>
          </Label>
          <WonInput
            {...fe.field("deposit")}
            value={form.deposit_actual}
            onChange={(v) => set("deposit_actual", v, "deposit")}
            className="sm:w-56"
            aria-describedby="movein-deposit-hint"
          />
          {errText("deposit")}
          <div id="movein-deposit-hint" className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Hint>
              {stdDeposit !== null ? `기준 보증금 ${pyeongText(form.pyeong_billed)} × 200,000원 = ${won(stdDeposit)}` : GLOSSARY.depositActual.hint}
            </Hint>
            {stdDeposit !== null && String(stdDeposit) !== form.deposit_actual && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="hover:bg-warm-beige hover:text-dark"
                onClick={() => set("deposit_actual", String(stdDeposit), "deposit")}
              >
                이 금액 넣기
              </Button>
            )}
          </div>
          <Hint>비워 두면 ‘보증금 기록 없음’으로 저장돼요.</Hint>
        </div>
        <div className="rounded-md bg-warm-beige/60 px-3 py-2.5">
          <p className="text-[15px] text-[#3f3f4e]">매달 청구 예상</p>
          <p className="mt-0.5 text-base font-semibold text-dark tabular-nums">{monthlyText(monthly)}</p>
          <p className="text-sm text-[#5f6070]">부가세 포함, 전기료 별도</p>
        </div>
      </Group>

      <Group n="③" title="어떻게 청구">
        <div className="space-y-2">
          <p id="movein-elec-label" className="text-base font-medium text-dark">
            전기료
          </p>
          <RadioGroup
            aria-labelledby="movein-elec-label"
            value={form.elec_method}
            onValueChange={(v) => set("elec_method", v as "area" | "metered")}
            className="gap-2"
          >
            <Choice id="elec-area" value="area" label="면적으로 나눠 내기" desc={isFactory(room.building) ? "본관 방식" : "본관 기본"} />
            <Choice id="elec-metered" value="metered" label="계량기 사용량대로" desc={isFactory(room.building) ? "공장동 기본" : "공장동 방식"} />
          </RadioGroup>
        </div>
        <div className="space-y-2">
          <p id="movein-first-label" className="text-base font-medium text-dark">
            첫 달
          </p>
          <RadioGroup
            aria-labelledby="movein-first-label"
            value={form.first_month_billing}
            onValueChange={(v) => set("first_month_billing", v as MonthBilling)}
            className="gap-2"
          >
            <Choice id="first-full" value="full" label={FIRST_MONTH_LABEL.full} desc={monthly ? `${won(monthly.gross)}` : undefined} />
            <Choice
              id="first-prorated"
              value="prorated"
              label={FIRST_MONTH_LABEL.prorated}
              desc={firstEst ? `${billMonthShort(firstEst.ym)} ${firstEst.usedDays}일 ≈ ${won(firstEst.amount)}` : "입주일을 고르면 예상액이 보여요"}
            />
            <Choice id="first-none" value="none" label={FIRST_MONTH_LABEL.none} />
          </RadioGroup>
          <Hint>입주한 달 청구서에는 전기료가 붙지 않아요(전기료는 쓴 다음 달에 청구해요). 실제 청구는 월 마감 3단계에서 계산해요.</Hint>
        </div>
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="group -ml-2 h-9 text-[15px] text-dark hover:bg-warm-beige">
              <ChevronRight className="transition-transform group-data-[state=open]:rotate-90" aria-hidden />
              다른 조건 — 계약 구분: {form.renewal_type === "new" ? "신규 입주" : "갱신"}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            <p id="movein-renewal-label" className="text-base font-medium text-dark">
              계약 구분
            </p>
            <RadioGroup
              aria-labelledby="movein-renewal-label"
              value={form.renewal_type}
              onValueChange={(v) => set("renewal_type", v as "new" | "renewal")}
              className="gap-2"
            >
              <Choice id="renewal-new" value="new" label="신규 입주" />
              <Choice id="renewal-renewal" value="renewal" label="갱신" />
            </RadioGroup>
          </CollapsibleContent>
        </Collapsible>
      </Group>

      <StickyActionBar
        className="-mx-5 -mb-4 rounded-none sm:-mx-5"
        secondary={
          <Button type="button" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={() => void cancel()} disabled={busy}>
            닫기
          </Button>
        }
        primary={
          <BusyButton type="submit" busy={busy} busyLabel="처리 중…">
            {room.code}호 입주 처리하기
          </BusyButton>
        }
      />
    </form>
  )
}

/** 라디오 한 줄 + 한 줄 설명 */
function Choice({ id, value, label, desc }: { id: string; value: string; label: string; desc?: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <RadioGroupItem id={id} value={value} className="mt-1" aria-describedby={desc ? `${id}-desc` : undefined} />
      <Label htmlFor={id} className={cn("flex flex-col items-start gap-0.5 text-base font-normal leading-snug text-dark")}>
        {label}
        {desc && (
          <span id={`${id}-desc`} className="text-sm text-text-secondary tabular-nums">
            {desc}
          </span>
        )}
      </Label>
    </div>
  )
}

