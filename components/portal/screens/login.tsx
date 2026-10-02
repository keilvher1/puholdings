"use client"

// 포털 로그인 폼(WP8, 계획서 4.5.2). 서버 page가 next(돌아갈 경로)·센터 전화를 넘긴다.
//   로고 + "창업보육센터 입주기업 포털" + 부제 → 이메일(autocomplete=username) · 비밀번호(current-password, [보기])
//   → 바로 아래 "비밀번호를 잊었거나 계정이 없나요? … 054-279-8710" → [로그인] → 홈페이지로 가기
//   오류는 role="alert" Notice. 계정이 있는지는 드러내지 않는다(서버도 더미 해시 비교, 가드 #15).
//   성공하면 must_change_password가 우선(계정 화면), 아니면 safeNext(next, "/portal/") ?? "/portal".

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FieldError } from "@/components/ui/field"
import { BusyButton, Notice, useFieldErrors } from "@/components/saas"
import { PasswordInput } from "@/components/portal/change-password-form"
import { friendlyError } from "@/lib/messages"
import { safeNext } from "@/lib/safe-next"

const WRONG = "이메일이나 비밀번호가 맞지 않아요. 다시 확인해 주세요."

export function PortalLoginForm({ next, phone }: { next: string | null; phone: string }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const fe = useFieldErrors({ email: "이메일", password: "비밀번호" })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!fe.check({ email: !email.trim() && "이메일을 입력해 주세요", password: !password && "비밀번호를 입력해 주세요" })) return
    setBusy(true)
    try {
      const res = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        // 임시 비밀번호면 비밀번호부터 정한다(미들웨어도 같은 규칙). 전체 이동으로 새 쿠키 기준 레이아웃을 그린다.
        window.location.href = data.must_change_password ? "/portal/settings" : (safeNext(next, "/portal/") ?? "/portal")
        return
      }
      if (res.status === 401) {
        // 퇴실 기업 안내는 비밀번호가 맞을 때만 오므로 계정 존재가 새로 드러나지 않는다
        // 401이라도 서버 쪽 장애("데이터베이스 연결 실패" 등)는 비밀번호 오류로 말하지 않는다(어느 쪽도 계정 존재를 드러내지 않음)
        const msg = typeof data.error === "string" ? data.error : ""
        if (msg.includes("퇴거")) setError("퇴실한 기업의 계정이라 로그인할 수 없어요. 창업보육센터로 연락해 주세요.")
        else if (!msg || msg.includes("올바르지 않")) setError(WRONG)
        else setError(friendlyError(500, null, "로그인하지 못했어요."))
      } else {
        setError(friendlyError(res.status, data.error, "로그인하지 못했어요."))
      }
    } catch {
      setError(friendlyError(0, null, "로그인하지 못했어요."))
    }
    setBusy(false)
  }

  const telHref = `tel:${phone.replace(/[^\d+]/g, "")}`

  return (
    <div className="flex min-h-screen items-start justify-center bg-warm-ivory px-4 py-10 sm:items-center">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Image src="/images/logo.png" alt="(주)포항연합기술지주" width={621} height={196} priority className="mx-auto h-12 w-auto" />
          <h1 className="mt-3 text-2xl font-bold text-dark">
            <span className="block text-base font-medium text-text-secondary">창업보육센터</span>
            입주기업 포털
          </h1>
          <p className="mt-2 text-base text-text-secondary [word-break:keep-all]">관리비 청구서와 지원 프로그램을 확인하는 곳이에요.</p>
        </div>

        <form onSubmit={submit} noValidate className="space-y-4 rounded-md border border-warm-tan bg-card p-5 sm:p-6">
          {error && <Notice tone="danger">{error}</Notice>}

          <div className="space-y-1.5">
            <Label htmlFor={fe.fieldId("email")} className="text-base font-medium text-dark">
              이메일
            </Label>
            <Input
              {...fe.field("email")}
              type="email"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              inputMode="email"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="company@example.com"
              className="h-11 bg-card text-base"
            />
            {fe.errors.email && (
              <FieldError id={fe.errorId("email")} className="text-[15px] text-red-800">
                {fe.errors.email}
              </FieldError>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={fe.fieldId("password")} className="text-base font-medium text-dark">
              비밀번호
            </Label>
            <PasswordInput
              id={fe.fieldId("password")}
              label="비밀번호"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              invalid={!!fe.errors.password}
              describedBy={fe.errors.password ? fe.errorId("password") : undefined}
            />
            {fe.errors.password && (
              <FieldError id={fe.errorId("password")} className="text-[15px] text-red-800">
                {fe.errors.password}
              </FieldError>
            )}
          </div>

          <p className="text-[15px] leading-relaxed text-text-secondary [word-break:keep-all]">
            비밀번호를 잊었거나 계정이 없나요? 창업보육센터로 연락해 주세요 ·{" "}
            <a href={telHref} className="whitespace-nowrap text-link underline underline-offset-2 hover:text-dark">
              {phone}
            </a>
          </p>

          <BusyButton type="submit" busy={busy} busyLabel="로그인하는 중…" className="h-11 w-full text-base">
            로그인
          </BusyButton>
        </form>

        <p className="mt-4 text-center">
          <Link href="/" className="inline-flex min-h-11 items-center text-base text-link underline underline-offset-2 hover:text-dark">
            홈페이지로 가기
          </Link>
        </p>
      </div>
    </div>
  )
}
