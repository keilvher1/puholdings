"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function AdminSetupPage() {
  const router = useRouter()
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (form.password !== form.confirmPassword) {
      setError("비밀번호가 일치하지 않습니다")
      return
    }

    if (form.password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다")
      return
    }

    setLoading(true)

    try {
      const res = await fetch("/api/admin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
      })

      const data = await res.json()

      if (data.success) {
        router.push("/admin/login")
      } else {
        setError(data.error || "관리자 생성에 실패했습니다")
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
          <h1 className="text-2xl font-bold text-dark">관리자 계정 생성</h1>
          <p className="mt-2 text-sm text-text-secondary">
            CMS 초기 관리자 계정을 생성하세요
          </p>
        </div>

        <div className="mb-4 rounded-lg border border-gold/30 bg-gold/5 px-4 py-3">
          <p className="text-sm font-medium text-dark">데모 모드</p>
          <p className="mt-1 text-xs text-text-secondary">
            DATABASE_URL이 설정되지 않아 데모 모드로 실행 중입니다.<br />
            아래 계정으로 바로 로그인하세요:
          </p>
          <p className="mt-2 font-mono text-xs text-gold">
            이메일: admin@puholdings.com<br />
            비밀번호: admin1234
          </p>
          <a 
            href="/admin/login" 
            className="mt-3 inline-block rounded bg-dark px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-dark-muted transition-colors"
          >
            로그인 페이지로 이동
          </a>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border border-warm-tan bg-card p-6">
          {error && (
            <div className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-dark">
              이름
            </label>
            <input
              id="name"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-md border border-warm-tan bg-card px-3 py-2.5 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
              placeholder="홍길동"
              required
            />
          </div>

          <div className="mb-4">
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-dark">
              이메일
            </label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-md border border-warm-tan bg-card px-3 py-2.5 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
              placeholder="admin@puholdings.com"
              required
            />
          </div>

          <div className="mb-4">
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-dark">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full rounded-md border border-warm-tan bg-card px-3 py-2.5 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
              placeholder="8자 이상"
              required
            />
          </div>

          <div className="mb-6">
            <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-dark">
              비밀번호 확인
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              className="w-full rounded-md border border-warm-tan bg-card px-3 py-2.5 text-sm outline-none focus:border-gold focus:ring-1 focus:ring-gold"
              placeholder="비밀번호 재입력"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-dark py-2.5 text-sm font-medium text-primary-foreground hover:bg-dark-muted transition-colors disabled:opacity-50"
          >
            {loading ? "생성 중..." : "관리자 계정 생성"}
          </button>

          <p className="mt-4 text-center text-xs text-text-secondary">
            이미 계정이 있으신가요?{" "}
            <a href="/admin/login" className="text-gold hover:underline">
              로그인
            </a>
          </p>
        </form>
      </div>
    </div>
  )
}
