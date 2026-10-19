"use client"

// 관리자 로그인 폼(app/admin/login/page.tsx가 next·문의처를 prop으로 넘긴다) — 계획서 4.1.4.
//   성공: safeNext(next, "/admin/")가 돌려주는 경로, 아니면 /admin(쿠키 적용을 위해 전체 새로 고침 이동)
//   401: "이메일이나 비밀번호가 맞지 않아요. 다시 입력해 주세요"(이메일 유지, 비밀번호 칸만 비움)
//   그 밖: "지금 로그인할 수 없어요. 잠시 뒤 다시 시도해 주세요"
//   문의처(getSupportContact())가 없으면 "비밀번호를 잊었다면" 줄을 숨긴다.

import { useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BrandPhotoPanel, BusyButton, Notice } from "@/components/saas"
import { safeNext } from "@/lib/safe-next"

const MSG_WRONG = "이메일이나 비밀번호가 맞지 않아요. 다시 입력해 주세요"
const MSG_DOWN = "지금 로그인할 수 없어요. 잠시 뒤 다시 시도해 주세요"

export function AdminLoginForm({ next, supportContact }: { next: string | null; supportContact: string | null }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [fieldError, setFieldError] = useState<{ email?: string; password?: string }>({})
  const [loading, setLoading] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    const fe: { email?: string; password?: string } = {}
    if (!email.trim()) fe.email = "이메일을 입력해 주세요"
    if (!password) fe.password = "비밀번호를 입력해 주세요"
    setFieldError(fe)
    if (fe.email) return emailRef.current?.focus()
    if (fe.password) return passwordRef.current?.focus()

    setLoading(true)
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        // 쿠키가 확실히 적용되도록 전체 새로 고침 이동
        window.location.href = safeNext(next, "/admin/") ?? "/admin"
        return
      }
      if (res.status === 401 || res.status === 400) {
        setError(MSG_WRONG)
        setPassword("")
        passwordRef.current?.focus()
      } else {
        setError(MSG_DOWN)
      }
    } catch {
      setError(MSG_DOWN)
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen bg-card">
      {/* 왼쪽 그림 판(1024px 이상) — 포털 로그인과 같은 부품 */}
      <BrandPhotoPanel eyebrow="PU Holdings Admin" description="입주기업 관리비·증빙·프로그램·소통을 한곳에서 관리해요" />

      {/* 로그인 폼 */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <img src="/brand/pu-holdings-logo.png" alt="포항연합기술지주" width={473} height={93} className="mb-10 h-8 w-auto lg:hidden" />

          <p aria-hidden className="text-xs font-bold uppercase leading-5 tracking-[0.16em] text-link">Admin login</p>
          <h1 className="mt-1.5 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-dark">관리자 로그인</h1>
          <p className="mt-2 text-base text-text-secondary [word-break:keep-all]">관리자 계정의 이메일과 비밀번호를 입력해 주세요</p>

          <form onSubmit={handleSubmit} noValidate className="mt-7">
            {error && (
              <Notice tone="danger" className="mb-4">
                {error}
              </Notice>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="email">이메일</Label>
              <Input
                ref={emailRef}
                id="email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                aria-invalid={fieldError.email ? true : undefined}
                aria-describedby={fieldError.email ? "email-error" : undefined}
                className="h-11 bg-card text-base"
              />
              {fieldError.email && (
                <p id="email-error" className="text-sm text-red-800">
                  {fieldError.email}
                </p>
              )}
            </div>

            <div className="mt-4 grid gap-1.5">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                ref={passwordRef}
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                aria-invalid={fieldError.password ? true : undefined}
                aria-describedby={fieldError.password ? "password-error" : undefined}
                className="h-11 bg-card text-base"
              />
              {fieldError.password && (
                <p id="password-error" className="text-sm text-red-800">
                  {fieldError.password}
                </p>
              )}
            </div>

            <BusyButton type="submit" busy={loading} busyLabel="로그인 중…" className="mt-6 h-11 w-full text-base font-semibold">
              로그인
            </BusyButton>
          </form>

          {supportContact && (
            <p className="mt-6 text-sm text-text-secondary [word-break:keep-all]">
              비밀번호를 잊었다면 {supportContact}에게 알려 주세요
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
