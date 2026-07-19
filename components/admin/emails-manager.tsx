"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { RotateCcw, Send, PenSquare } from "lucide-react"

interface EmailLog {
  id: number
  to_email: string
  tenant_id: number | null
  tenant_name: string | null
  template_code: string | null
  subject: string | null
  status: "queued" | "sent" | "failed"
  error: string | null
  sent_at: string | null
  created_at: string
}

interface TenantOption {
  id: number
  name: string
  status: string
  account_email: string | null
  contact_email: string | null
}

function formatDateTime(value: string | null): string {
  if (!value) return "-"
  return new Date(value).toLocaleString("ko-KR", {
    year: "2-digit", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  })
}

export function EmailsManager() {
  const [logs, setLogs] = useState<EmailLog[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("all")
  const [error, setError] = useState("")
  const [resendingId, setResendingId] = useState<number | null>(null)

  // 새 메일 Dialog
  const [composeOpen, setComposeOpen] = useState(false)
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [subject, setSubject] = useState("")
  const [bodyHtml, setBodyHtml] = useState("")
  const [sending, setSending] = useState(false)
  const [composeError, setComposeError] = useState("")
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; skipped: string[] } | null>(null)

  const fetchLogs = useCallback(async (status: string) => {
    setLoading(true)
    setError("")
    try {
      const qs = status === "all" ? "" : `?status=${status}`
      const res = await fetch(`/api/admin/emails${qs}`, { credentials: "include" })
      const data = await res.json()
      if (data.success) {
        setLogs(data.logs)
      } else {
        setError(data.error || "목록을 불러오지 못했습니다")
      }
    } catch {
      setError("서버 오류가 발생했습니다")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLogs(statusFilter)
  }, [fetchLogs, statusFilter])

  const handleResend = async (log: EmailLog) => {
    setResendingId(log.id)
    try {
      const res = await fetch("/api/admin/emails/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: log.id }),
      })
      const data = await res.json()
      if (!data.success) {
        alert(data.error || "재발송에 실패했습니다")
      }
      fetchLogs(statusFilter)
    } catch {
      alert("서버 오류가 발생했습니다")
    } finally {
      setResendingId(null)
    }
  }

  const openCompose = async () => {
    setSubject("")
    setBodyHtml("")
    setSelectedIds(new Set())
    setComposeError("")
    setSendResult(null)
    setComposeOpen(true)
    setTenantOptions([])
    try {
      const res = await fetch("/api/admin/tenants?status=active", { credentials: "include" })
      const data = await res.json()
      if (data.success) {
        setTenantOptions(data.tenants)
      } else {
        setComposeError(data.error || "기업 목록을 불러오지 못했습니다")
      }
    } catch {
      setComposeError("기업 목록을 불러오지 못했습니다")
    }
  }

  const selectableTenants = tenantOptions.filter((t) => t.account_email || t.contact_email)
  const allSelected = selectableTenants.length > 0 && selectableTenants.every((t) => selectedIds.has(t.id))

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(selectableTenants.map((t) => t.id)))
    }
  }

  const toggleOne = (id: number) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const handleSend = async () => {
    if (selectedIds.size === 0) {
      setComposeError("수신 기업을 선택해주세요")
      return
    }
    if (!subject.trim() || !bodyHtml.trim()) {
      setComposeError("제목과 본문을 입력해주세요")
      return
    }
    setSending(true)
    setComposeError("")
    try {
      const res = await fetch("/api/admin/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tenant_ids: Array.from(selectedIds),
          subject,
          body_html: bodyHtml,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSendResult({ sent: data.sent, failed: data.failed, skipped: data.skipped || [] })
        fetchLogs(statusFilter)
      } else {
        setComposeError(data.error || "발송에 실패했습니다")
      }
    } catch {
      setComposeError("서버 오류가 발생했습니다")
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="sent">발송 성공</SelectItem>
            <SelectItem value="failed">발송 실패</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={openCompose}>
          <PenSquare className="h-4 w-4" />
          새 메일
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      <div className="rounded-lg border border-warm-tan bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>수신자</TableHead>
              <TableHead>템플릿</TableHead>
              <TableHead>제목</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>시각</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-text-secondary">
                  불러오는 중...
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-text-secondary">
                  발송 이력이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <div className="text-sm">{log.to_email}</div>
                    {log.tenant_name && (
                      <div className="text-xs text-text-secondary">{log.tenant_name}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">{log.template_code || "-"}</span>
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-sm" title={log.subject || ""}>
                    {log.subject || "-"}
                  </TableCell>
                  <TableCell>
                    {log.status === "sent" ? (
                      <Badge>성공</Badge>
                    ) : log.status === "failed" ? (
                      <div>
                        <Badge variant="destructive">실패</Badge>
                        {log.error && (
                          <div className="mt-1 max-w-44 truncate text-xs text-destructive" title={log.error}>
                            {log.error}
                          </div>
                        )}
                      </div>
                    ) : (
                      <Badge variant="secondary">대기</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-text-secondary">
                    {formatDateTime(log.sent_at || log.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    {/* tenant_welcome은 비밀번호가 마스킹되어 재발송 불가 (비밀번호 초기화로 재발급) */}
                    {log.status === "failed" && log.template_code !== "tenant_welcome" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResend(log)}
                        disabled={resendingId === log.id}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {resendingId === log.id ? "재발송 중..." : "재발송"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 새 메일 Dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>새 메일 발송</DialogTitle>
            <DialogDescription>
              입주 중인 기업에 직접 작성한 메일을 발송합니다. 본문에 {"{{tenant_name}}"}(기업명),{" "}
              {"{{portal_url}}"}(포털 로그인 주소)를 쓸 수 있습니다.
            </DialogDescription>
          </DialogHeader>

          {sendResult ? (
            <div className="grid gap-3">
              <div className="rounded-md bg-warm-beige px-4 py-3 text-sm">
                <p className="font-medium text-dark">
                  발송 완료: 성공 {sendResult.sent}건
                  {sendResult.failed > 0 && `, 실패 ${sendResult.failed}건`}
                </p>
                {sendResult.skipped.length > 0 && (
                  <p className="mt-1 text-xs text-text-secondary">
                    이메일이 없어 건너뜀: {sendResult.skipped.join(", ")}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button onClick={() => setComposeOpen(false)}>닫기</Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              {composeError && (
                <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {composeError}
                </div>
              )}

              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label>수신 기업 ({selectedIds.size}곳 선택됨)</Label>
                    <button
                      type="button"
                      onClick={toggleAll}
                      className="text-xs text-gold hover:underline"
                    >
                      {allSelected ? "전체 해제" : "전체 선택"}
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-md border border-warm-tan p-2">
                    {selectableTenants.length === 0 ? (
                      <p className="px-2 py-3 text-sm text-text-secondary">
                        메일을 보낼 수 있는 기업이 없습니다
                      </p>
                    ) : (
                      selectableTenants.map((t) => (
                        <label
                          key={t.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-warm-beige"
                        >
                          <Checkbox
                            checked={selectedIds.has(t.id)}
                            onCheckedChange={() => toggleOne(t.id)}
                          />
                          <span className="text-sm text-dark">{t.name}</span>
                          <span className="text-xs text-text-secondary">
                            {t.account_email || t.contact_email}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="mail-subject">제목</Label>
                  <Input
                    id="mail-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="mail-body">본문 (HTML)</Label>
                  <Textarea
                    id="mail-body"
                    rows={10}
                    value={bodyHtml}
                    onChange={(e) => setBodyHtml(e.target.value)}
                    placeholder="<p>{{tenant_name}} 담당자님, 안녕하세요.</p>"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setComposeOpen(false)} disabled={sending}>
                  취소
                </Button>
                <Button onClick={handleSend} disabled={sending}>
                  <Send className="h-4 w-4" />
                  {sending ? "발송 중..." : `${selectedIds.size}곳에 발송`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
