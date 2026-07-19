"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function ChangePasswordForm({ mustChange }: { mustChange: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (newPassword.length < 8) {
      setError("새 비밀번호는 8자 이상이어야 합니다")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("새 비밀번호가 서로 일치하지 않습니다")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/portal/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      })
      const data = await res.json()

      if (data.success) {
        // 새 토큰(must_change_password 해제)이 적용되도록 전체 리로드
        window.location.href = "/portal"
      } else {
        setError(data.error || "비밀번호 변경에 실패했습니다")
      }
    } catch {
      setError("서버 오류가 발생했습니다")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="text-base">비밀번호 변경</CardTitle>
        <CardDescription>
          {mustChange
            ? "임시 비밀번호로 로그인하셨습니다. 계속하려면 새 비밀번호를 설정해주세요."
            : "로그인에 사용할 비밀번호를 변경합니다"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="mb-4 grid gap-1.5">
            <Label htmlFor="current-password">
              {mustChange ? "임시 비밀번호" : "현재 비밀번호"}
            </Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>

          <div className="mb-4 grid gap-1.5">
            <Label htmlFor="new-password">새 비밀번호 (8자 이상)</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <div className="mb-6 grid gap-1.5">
            <Label htmlFor="confirm-password">새 비밀번호 확인</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "변경 중..." : "비밀번호 변경"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
