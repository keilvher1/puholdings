"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function PortalLoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      })

      const data = await res.json()

      if (data.success) {
        // 임시 비밀번호로 로그인한 경우 비밀번호 변경 강제 (middleware도 동일하게 차단)
        window.location.href = data.must_change_password ? "/portal/settings" : "/portal"
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
    <div className="flex min-h-screen items-center justify-center bg-warm-ivory px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-dark text-primary-foreground font-bold">
            PU
          </div>
          <h1 className="text-2xl font-bold text-dark">입주기업 포털</h1>
          <p className="mt-2 text-sm text-text-secondary">
            발급받은 계정으로 로그인하세요
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border border-warm-tan bg-card p-6">
          {error && (
            <div className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="mb-4 grid gap-1.5">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="company@example.com"
              required
            />
          </div>

          <div className="mb-6 grid gap-1.5">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </Button>

          <p className="mt-4 text-center text-xs text-text-secondary">
            계정이 없거나 비밀번호를 잊으셨다면 창업보육센터 관리자에게 문의하세요
          </p>
        </form>
      </div>
    </div>
  )
}
