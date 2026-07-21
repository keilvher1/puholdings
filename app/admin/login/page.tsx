"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function AdminLoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      })

      const data = await res.json()

      if (data.success) {
        // Use window.location for full page reload to ensure cookies are applied
        window.location.href = "/admin"
      } else {
        setError(data.error || "로그인에 실패했습니다")
      }
    } catch {
      setError("서버 오류가 발생했습니다")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* 좌측 브랜드 패널 (데스크톱) */}
      <div className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-dark p-10 lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold text-sm font-black text-dark">
            PU
          </div>
          <span className="text-sm font-semibold text-primary-foreground">포항연합기술지주</span>
        </div>
        <div>
          <p className="text-[11px] font-medium tracking-[0.3em] text-gold">ADMIN SYSTEM</p>
          <h1 className="mt-3 text-3xl font-bold leading-snug text-primary-foreground">
            기술의 가능성을
            <br />
            <span className="bg-gradient-to-r from-gold to-gold-light bg-clip-text text-transparent">
              미래의 가치로
            </span>
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-primary-foreground/50 [word-break:keep-all]">
            홈페이지 콘텐츠, 입주기업, 관리비 정산, 프로그램을 한 곳에서 운영합니다.
          </p>
        </div>
        <p className="text-[11px] text-primary-foreground/30">
          © {new Date().getFullYear()} PU Holdings Co., Ltd.
        </p>
        {/* 장식 */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-gold/5 blur-3xl" />
      </div>

      {/* 우측 로그인 폼 */}
      <div className="flex flex-1 items-center justify-center bg-warm-ivory px-4">
        <div className="w-full max-w-sm">
          {/* 모바일 로고 */}
          <div className="mb-8 text-center lg:hidden">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-dark text-sm font-black text-gold">
              PU
            </div>
          </div>

          <h2 className="text-xl font-bold text-dark">관리자 로그인</h2>
          <p className="mt-1 text-sm text-text-secondary">계정 정보를 입력해 주세요</p>

          <form onSubmit={handleSubmit} className="mt-7">
            {error && (
              <div className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@puholdings.com"
                autoComplete="username"
                required
                className="h-11 bg-card"
              />
            </div>

            <div className="mt-4 grid gap-1.5">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="h-11 bg-card"
              />
            </div>

            <Button type="submit" disabled={loading} className="mt-6 h-11 w-full text-sm font-semibold">
              {loading ? "로그인 중..." : "로그인"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-text-tertiary">
            계정 문의는 시스템 관리 담당자에게 연락해 주세요
          </p>
        </div>
      </div>
    </div>
  )
}
