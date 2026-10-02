"use client"

// 포털 비밀번호 바꾸기 폼(계획서 4.5.8) — 계정 화면의 "비밀번호 바꾸기" 카드 본문, 임시 비밀번호 첫 로그인 화면의 본문.
//   칸마다 [보기], 제출 때 한 번에 검증 → 칸 아래 오류(2개 이상이면 오류 요약). 필수값이 비어도 버튼은 켜 둔다.
//   성공: 일반 = 이 화면에 머문 채 Notice(success) + 토스트 / 임시 비밀번호 = 홈으로 + 토스트 "비밀번호를 정했어요".
//   서버(/api/portal/change-password)는 새 토큰(must_change_password 해제)을 쿠키로 다시 준다.
//
// 사용 예:
//   <ChangePasswordForm mustChange={session.must_change_password} />
//   <PasswordInput id="password" label="비밀번호" value={pw} onChange={setPw} autoComplete="current-password" />   // 로그인 화면도 같이 쓴다

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Label } from "@/components/ui/label"
import { FieldError } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { BusyButton, ErrorSummary, Notice, toastSuccess, useFieldErrors } from "@/components/saas"
import { friendlyError } from "@/lib/messages"

export function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  invalid,
  describedBy,
}: {
  id: string
  /** [보기] 버튼 이름에 쓴다("새 비밀번호 보기") */
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: "current-password" | "new-password"
  invalid?: boolean
  describedBy?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <InputGroup className="h-11 bg-card">
      <InputGroupInput
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="text-base"
      />
      {/* [보기]는 입력칸과 같은 높이(44px)로 — 테두리 위까지 덮어 누름 영역을 넓힌다 */}
      <InputGroupAddon align="inline-end" className="h-full py-0 pr-0 has-[>button]:mr-0">
        <InputGroupButton
          type="button"
          size="sm"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? `${label} 숨기기` : `${label} 보기`}
          aria-pressed={show}
          className="-my-px -mr-px h-11 min-w-14 rounded-l-none rounded-r-md px-3 text-sm text-[#3f3f4e] hover:bg-warm-beige hover:text-dark"
        >
          {show ? "숨기기" : "보기"}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

const WRONG_CURRENT = /현재 비밀번호|올바르지 않/

export function ChangePasswordForm({ mustChange }: { mustChange: boolean }) {
  const router = useRouter()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirmValue, setConfirmValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState("")
  const [done, setDone] = useState(false)
  const currentLabel = mustChange ? "임시 비밀번호" : "현재 비밀번호"
  const fe = useFieldErrors({ current: currentLabel, next: "새 비밀번호", confirm: "새 비밀번호 확인" })

  const describe = (key: "current" | "next" | "confirm", hint?: string) =>
    [hint, fe.errors[key] ? fe.errorId(key) : null].filter(Boolean).join(" ") || undefined

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError("")
    setDone(false)
    const ok = fe.check({
      current: !current && `${currentLabel}를 입력해 주세요`,
      next: !next ? "새 비밀번호를 입력해 주세요" : next.length < 8 && "새 비밀번호를 8자 이상으로 정해 주세요",
      confirm: !confirmValue ? "새 비밀번호를 한 번 더 입력해 주세요" : confirmValue !== next && "새 비밀번호가 서로 달라요",
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch("/api/portal/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ current_password: current, new_password: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setCurrent("")
        setNext("")
        setConfirmValue("")
        if (mustChange) {
          toastSuccess("비밀번호를 정했어요")
          router.replace("/portal")
          router.refresh()
          return
        }
        setDone(true)
        toastSuccess("비밀번호를 바꿨어요")
        router.refresh()
        return
      }
      if (res.status === 400 && typeof data.error === "string" && WRONG_CURRENT.test(data.error)) {
        fe.setErrors({ current: `${currentLabel}가 맞지 않아요. 다시 확인해 주세요` })
        return
      }
      setServerError(friendlyError(res.status, data.error, "비밀번호를 바꾸지 못했어요."))
    } catch {
      setServerError(friendlyError(0, null, "비밀번호를 바꾸지 못했어요."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {done && (
        <Notice tone="success" onClose={() => setDone(false)}>
          비밀번호를 바꿨어요. 다음 로그인부터 새 비밀번호를 쓰세요.
        </Notice>
      )}
      <ErrorSummary errors={fe.summary} />
      {serverError && (
        <Notice tone="danger" title="비밀번호를 바꾸지 못했어요">
          {serverError}
        </Notice>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={fe.fieldId("current")} className="text-base font-medium text-dark">
          {currentLabel}
        </Label>
        <PasswordInput
          id={fe.fieldId("current")}
          label={currentLabel}
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
          invalid={!!fe.errors.current}
          describedBy={describe("current")}
        />
        {fe.errors.current && (
          <FieldError id={fe.errorId("current")} className="text-[15px] text-red-800">
            {fe.errors.current}
          </FieldError>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={fe.fieldId("next")} className="text-base font-medium text-dark">
          새 비밀번호
        </Label>
        <PasswordInput
          id={fe.fieldId("next")}
          label="새 비밀번호"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          invalid={!!fe.errors.next}
          describedBy={describe("next", "f-next-hint")}
        />
        <p id="f-next-hint" className="text-sm text-text-secondary">
          8자 이상
        </p>
        {fe.errors.next && (
          <FieldError id={fe.errorId("next")} className="text-[15px] text-red-800">
            {fe.errors.next}
          </FieldError>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={fe.fieldId("confirm")} className="text-base font-medium text-dark">
          새 비밀번호 확인
        </Label>
        <PasswordInput
          id={fe.fieldId("confirm")}
          label="새 비밀번호 확인"
          value={confirmValue}
          onChange={setConfirmValue}
          autoComplete="new-password"
          invalid={!!fe.errors.confirm}
          describedBy={describe("confirm")}
        />
        {fe.errors.confirm && (
          <FieldError id={fe.errorId("confirm")} className="text-[15px] text-red-800">
            {fe.errors.confirm}
          </FieldError>
        )}
      </div>

      <BusyButton type="submit" busy={busy} className="h-11 w-full text-base sm:w-auto">
        {mustChange ? "비밀번호 정하기" : "비밀번호 바꾸기"}
      </BusyButton>
    </form>
  )
}
