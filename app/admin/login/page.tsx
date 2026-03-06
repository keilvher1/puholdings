"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function AdminLoginPage() {
  const router = useRouter()
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
      })

      const data = await res.json()

      if (data.success) {
        router.push("/admin")
        router.refresh()
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
          <h1 className="text-2xl font-bold text-dark">관리자 로그인</h1>
          <p className="mt-2 text-sm text-text-secondary">
            포항연합기술지주 CMS에 로그인하세요
          </p>
        </div>

        <div className="mb-4 rounded-lg border border-gold/30 bg-gold/5 px-4 py-3">
          <p className="text-sm font-medium text-dark">데모 계정</p>
          <p className="mt-1 font-mono text-xs text-text-secondary">
            이메일: admin@puholdings.com<br />
            비밀번호: admin1234
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border border-warm-tan bg-card p-6">
          {error && (
            <div className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-dark">
              이메일
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-warm-tan bg-card px-3 py-2.5 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
              placeholder="admin@puholdings.com"
              required
            />
          </div>

          <div className="mb-6">
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-dark">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-warm-tan bg-card px-3 py-2.5 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-dark py-2.5 text-sm font-medium text-primary-foreground hover:bg-dark-muted transition-colors disabled:opacity-50"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>

          <p className="mt-4 text-center text-xs text-text-secondary">
            계정이 없으신가요?{" "}
            <a href="/admin/setup" className="text-gold hover:underline">
              초기 설정
            </a>
          </p>
        </form>
      </div>
    </div>
  )
}
