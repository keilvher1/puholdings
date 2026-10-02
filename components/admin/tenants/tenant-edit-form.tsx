"use client"

// 기업 등록·정보 수정 폼(계획서 4.3.7) — 한 열, 3구획(기본 정보 · 연락·청구 메일 · 기타) + 호실·입주일 읽기 전용 줄.
// 시트(DetailSheet)의 본문·바닥 버튼을 부르는 쪽이 배치할 수 있게 훅으로 만든다:
//   const form = useTenantForm({ mode: "edit", tenant, mailEnabled, onSaved })
//   <DetailSheet dirty={form.dirty} footer={<BusyButton busy={form.saving} onClick={form.submit}>저장하기</BusyButton>}>{form.body}</DetailSheet>
//
// 저장 규칙(API 계약): 수정은 **바뀐 칸만** PUT으로 보낸다(키가 없으면 서버가 기존 값을 유지). 형식 검증도 바뀐 칸만.
// 수기 칸(room_no·move_in_date·move_out_date)은 입력란이 없고 계약 기준 값을 읽기 전용으로 보여 준다(컬럼·데이터는 그대로).
// 진행 중 계약이 있는 기업을 ‘퇴실’ 상태로 저장하려 하면 막는다(청구는 계약 기준이라 계속되기 때문).

import { useMemo, useState } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { FieldError } from "@/components/ui/field"
import { ErrorSummary, Notice, Section, WonInput, useFieldErrors } from "@/components/saas"
import { date as fmtDate } from "@/lib/format"
import { friendlyError, MSG } from "@/lib/messages"
import { GLOSSARY } from "@/lib/glossary"
import { roomsHref } from "@/lib/links"
import { businessNoError, emailError, roomsLabel, type TenantRow } from "@/lib/tenant-model"

type Key = "name" | "business_no" | "ceo_name" | "tax_email" | "manager_name" | "contact_email" | "contact_phone" | "status" | "overpaid_balance" | "memo"

const LABELS: Record<Key, string> = {
  name: "기업명",
  business_no: "사업자번호",
  ceo_name: "대표자",
  tax_email: "청구서 받을 메일",
  manager_name: "청구 담당자 이름",
  contact_email: "담당자 메일",
  contact_phone: "연락처",
  status: "기업 상태",
  overpaid_balance: "더 받은 금액(과납)",
  memo: "메모",
}

type FormState = Record<Key, string>

function initialState(t: TenantRow | null): FormState {
  return {
    name: t?.name ?? "",
    business_no: t?.business_no ?? "",
    ceo_name: t?.ceo_name ?? "",
    tax_email: t?.tax_email ?? "",
    manager_name: t?.manager_name ?? "",
    contact_email: t?.contact_email ?? "",
    contact_phone: t?.contact_phone ?? "",
    status: t?.status ?? "active",
    overpaid_balance: t?.overpaid_balance != null ? String(Math.round(Number(t.overpaid_balance))) : "0",
    memo: t?.memo ?? "",
  }
}

const norm = (v: string) => v.trim()

/** 진행 중 계약 안내 문구("이 기업은 204호 계약이 아직 진행 중이에요") */
export function activeContractSentence(t: Pick<TenantRow, "contract_rooms" | "active_contracts">): string {
  const rooms = roomsLabel(t.contract_rooms)
  return rooms ? `이 기업은 ${rooms} 계약이 아직 진행 중이에요` : `이 기업은 진행 중인 계약이 ${t.active_contracts}건 있어요`
}

export function firstRoomCode(rooms: string | null | undefined): string | null {
  return rooms ? (rooms.split(/,\s*/)[0] ?? null) : null
}

export function useTenantForm({
  mode,
  tenant,
  mailEnabled,
  onSaved,
}: {
  mode: "create" | "edit"
  tenant: TenantRow | null
  mailEnabled: boolean
  /** 저장 성공(unchanged = 바꾼 칸이 없어 요청을 보내지 않음) */
  onSaved: (saved: { id: number; name: string; unchanged?: boolean }) => void
}) {
  const initial = useMemo(() => initialState(tenant), [tenant])
  const [form, setForm] = useState<FormState>(initial)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState("")
  const fe = useFieldErrors(LABELS)

  const changedKeys = (Object.keys(LABELS) as Key[]).filter((k) => norm(form[k]) !== norm(initial[k]))
  const dirty = changedKeys.length > 0
  const activeContracts = tenant?.active_contracts ?? 0

  const set = (k: Key) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    if (fe.errors[k]) fe.clear(k)
  }

  const submit = async (): Promise<boolean> => {
    if (saving) return false
    setServerError("")
    const changed = new Set(changedKeys)
    const isCreate = mode === "create"
    const rules: Partial<Record<Key, string | null | false>> = {
      name: !norm(form.name) && "기업명을 입력해 주세요",
      business_no: (isCreate || changed.has("business_no")) && businessNoError(form.business_no),
      tax_email: (isCreate || changed.has("tax_email")) && emailError(form.tax_email, LABELS.tax_email),
      contact_email: (isCreate || changed.has("contact_email")) && emailError(form.contact_email, LABELS.contact_email),
      status:
        !isCreate && changed.has("status") && form.status === "moved_out" && activeContracts > 0 && tenant
          ? `${activeContractSentence(tenant)}. 퇴실은 호실 현황에서 처리해야 청구가 멈춰요`
          : null,
      overpaid_balance:
        !isCreate && changed.has("overpaid_balance") && form.overpaid_balance !== "" && !(Number(form.overpaid_balance) >= 0)
          ? "0 이상의 금액을 넣어 주세요"
          : null,
    }
    if (!fe.check(rules)) return false
    if (!isCreate && !dirty) {
      onSaved({ id: tenant!.id, name: tenant!.name, unchanged: true })
      return true
    }

    let body: Record<string, unknown>
    if (isCreate) {
      body = {
        name: norm(form.name),
        business_no: form.business_no,
        ceo_name: form.ceo_name,
        tax_email: form.tax_email,
        manager_name: form.manager_name,
        contact_email: form.contact_email,
        contact_phone: form.contact_phone,
        memo: form.memo,
      }
    } else {
      body = { id: tenant!.id }
      for (const k of changedKeys) body[k] = k === "overpaid_balance" ? (form[k] === "" ? null : form[k]) : form[k]
    }

    setSaving(true)
    try {
      const res = await fetch("/api/admin/tenants", {
        method: isCreate ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        onSaved({ id: Number(data.tenant?.id ?? tenant?.id), name: String(data.tenant?.name ?? norm(form.name)) })
        return true
      }
      if (data.field_errors && typeof data.field_errors === "object") {
        const known = Object.fromEntries(Object.entries(data.field_errors as Record<string, string>).filter(([k]) => k in LABELS))
        if (Object.keys(known).length > 0) {
          fe.setErrors(known as Partial<Record<Key, string>>)
          return false
        }
      }
      setServerError(friendlyError(res.status, data.error, MSG.saveFailed))
      return false
    } catch {
      setServerError(friendlyError(0, null, MSG.saveFailed))
      return false
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setForm(initial)
    fe.clear()
    setServerError("")
  }

  const hint = (id: string, text: string) => (
    <p id={id} className="text-sm leading-relaxed text-text-secondary [word-break:keep-all]">
      {text}
    </p>
  )
  const describedBy = (k: Key, hintId?: string) => [fe.errors[k] ? fe.errorId(k) : null, hintId].filter(Boolean).join(" ") || undefined

  const textField = (k: Key, opts: { type?: string; hint?: string; required?: boolean; autoComplete?: string; inputMode?: "email" | "tel" | "numeric" } = {}) => {
    const hintId = opts.hint ? `${fe.fieldId(k)}-hint` : undefined
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={fe.fieldId(k)} className="text-base font-medium text-dark">
          {LABELS[k]}
          {opts.required && <span className="text-text-secondary"> (필수)</span>}
        </Label>
        <Input
          id={fe.fieldId(k)}
          type={opts.type ?? "text"}
          inputMode={opts.inputMode}
          autoComplete={opts.autoComplete ?? "off"}
          value={form[k]}
          onChange={(e) => set(k)(e.target.value)}
          aria-invalid={fe.errors[k] ? true : undefined}
          aria-describedby={describedBy(k, hintId)}
          className="h-10 bg-card text-base"
        />
        {fe.errors[k] && <FieldError id={fe.errorId(k)}>{fe.errors[k]}</FieldError>}
        {opts.hint && hint(hintId!, opts.hint)}
      </div>
    )
  }

  const rooms = roomsLabel(tenant?.contract_rooms)
  const roomCode = firstRoomCode(tenant?.contract_rooms)
  const statusBlocked = mode === "edit" && form.status === "moved_out" && initial.status !== "moved_out" && activeContracts > 0

  const body = (
    <div className="space-y-5">
      <ErrorSummary errors={fe.summary} />
      {serverError && (
        <Notice tone="danger" title={MSG.saveFailed}>
          {serverError}
        </Notice>
      )}

      <Section title="기본 정보" headingLevel={3}>
        <div className="grid gap-4">
          {textField("name", { required: true, autoComplete: "organization" })}
          {textField("business_no", { hint: "숫자 10자리예요(예: 123-45-67890). 하이픈은 없어도 돼요", inputMode: "numeric" })}
          {textField("ceo_name")}
        </div>
      </Section>

      <Section title="연락·청구 메일" headingLevel={3}>
        <div className="grid gap-4">
          {textField("tax_email", {
            type: "email",
            inputMode: "email",
            hint: mailEnabled
              ? "청구서 발행 메일이 이 주소로 가요. 비우면 아래 담당자 메일로 가요"
              : "청구서 발행 메일을 받을 주소예요. 비우면 아래 담당자 메일을 써요. 지금은 메일 발송이 설정되지 않아 메일은 나가지 않아요",
          })}
          {textField("manager_name", { hint: "청구서와 입금을 챙기는 분이에요" })}
          {textField("contact_email", {
            type: "email",
            inputMode: "email",
            hint: mailEnabled ? "납부 안내 메일은 이 주소로 가요" : "납부 안내 메일을 받을 주소예요",
          })}
          {textField("contact_phone", { type: "tel", inputMode: "tel" })}
        </div>
      </Section>

      <Section title="기타" headingLevel={3}>
        <div className="grid gap-4">
          {mode === "edit" && (
            <fieldset className="grid gap-1.5" aria-describedby={fe.errors.status ? fe.errorId("status") : undefined}>
              <legend className="mb-1.5 text-base font-medium text-dark">{LABELS.status}</legend>
              <RadioGroup
                id={fe.fieldId("status")}
                value={form.status}
                onValueChange={set("status")}
                className="flex flex-wrap gap-4"
                aria-invalid={fe.errors.status ? true : undefined}
              >
                <div className="flex min-h-9 items-center gap-2">
                  <RadioGroupItem value="active" id="f-status-active" aria-label="입주 중" />
                  <Label htmlFor="f-status-active" className="text-base font-normal">
                    입주 중
                  </Label>
                </div>
                <div className="flex min-h-9 items-center gap-2">
                  <RadioGroupItem value="moved_out" id="f-status-moved-out" aria-label="퇴실" />
                  <Label htmlFor="f-status-moved-out" className="text-base font-normal">
                    퇴실
                  </Label>
                </div>
              </RadioGroup>
              {fe.errors.status ? (
                <FieldError id={fe.errorId("status")}>
                  {fe.errors.status}{" "}
                  {roomCode && (
                    <Link href={roomsHref({ room: roomCode, action: "moveout" })} className="whitespace-nowrap text-link underline underline-offset-2">
                      호실 현황에서 퇴실 처리 ›
                    </Link>
                  )}
                </FieldError>
              ) : statusBlocked ? (
                <p className="text-sm text-text-secondary">저장하려면 호실 현황에서 먼저 퇴실 처리해 주세요</p>
              ) : (
                hint(
                  "f-status-hint",
                  `기업 상태만 바꿔요. 계약을 끝내는 퇴실 처리는 호실 현황에서 해요. ‘퇴실’이면 포털에 로그인할 수 없어요${mailEnabled ? ". 남은 청구서의 납부 안내 메일도 보내지 않아요" : ""}`,
                )
              )}
            </fieldset>
          )}
          {mode === "edit" && (
            <div className="grid gap-1.5">
              <Label htmlFor={fe.fieldId("overpaid_balance")} className="text-base font-medium text-dark">
                {LABELS.overpaid_balance}
              </Label>
              <WonInput
                id={fe.fieldId("overpaid_balance")}
                value={form.overpaid_balance === "" ? null : form.overpaid_balance}
                onChange={(v) => set("overpaid_balance")(v ?? "")}
                invalid={!!fe.errors.overpaid_balance}
                aria-describedby={describedBy("overpaid_balance", "f-overpaid-hint")}
                className="max-w-60"
              />
              {fe.errors.overpaid_balance && <FieldError id={fe.errorId("overpaid_balance")}>{fe.errors.overpaid_balance}</FieldError>}
              {hint("f-overpaid-hint", GLOSSARY.overpaid.hint ?? GLOSSARY.overpaid.definition)}
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor={fe.fieldId("memo")} className="text-base font-medium text-dark">
              {LABELS.memo}
            </Label>
            <Textarea id={fe.fieldId("memo")} rows={3} value={form.memo} onChange={(e) => set("memo")(e.target.value)} className="bg-card text-base" />
          </div>
        </div>
      </Section>

      {mode === "edit" ? (
        <div className="rounded-md border border-warm-tan bg-warm-ivory px-4 py-3">
          <p className="text-base font-medium text-dark">호실 · 입주일</p>
          <p className="mt-0.5 text-base text-dark">
            {rooms ? (
              <>
                {rooms}
                {tenant?.contract_start ? ` · ${fmtDate(tenant.contract_start)} 입주` : ""}
              </>
            ) : (
              "진행 중인 계약이 없어요"
            )}
          </p>
          <p className="mt-1 text-sm text-[#5f6070] [word-break:keep-all]">
            계약에서 가져와요. 여기서는 고칠 수 없어요 —{" "}
            <Link href={roomsHref(roomCode ? { room: roomCode } : {})} className="text-link underline underline-offset-2">
              호실 현황에서 처리 ›
            </Link>
          </p>
        </div>
      ) : (
        <Notice tone="info">
          입주 처리(호실·입주일·계약)는{" "}
          <Link href={roomsHref({ state: "vacant" })} className="text-link underline underline-offset-2">
            호실 현황에서 해요 ›
          </Link>
        </Notice>
      )}
    </div>
  )

  return { body, dirty, saving, submit, reset }
}
