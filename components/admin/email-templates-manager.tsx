"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Pencil } from "lucide-react"

interface EmailTemplate {
  id: number
  code: string
  name: string
  subject: string
  body_html: string
  updated_at: string
}

// 템플릿별 사용 가능한 변수 안내
const TEMPLATE_VARS: Record<string, string[]> = {
  tenant_welcome: ["tenant_name", "email", "temp_password", "portal_url"],
  bill_issued: ["tenant_name", "bill_month", "amount", "due_date", "portal_url"],
  bill_reminder: ["tenant_name", "bill_month", "amount", "due_date", "portal_url"],
  program_notice: ["tenant_name", "program_name", "program_period", "apply_due", "portal_url"],
  application_result: ["tenant_name", "program_name", "result", "note", "portal_url"],
  submission_reminder: ["tenant_name", "submission_name", "due_date", "portal_url"],
  submission_feedback: ["tenant_name", "submission_name", "feedback", "portal_url"],
  inquiry_received: ["name", "email", "phone", "company", "message", "received_at"],
}

export function EmailTemplatesManager() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<EmailTemplate | null>(null)
  const [subject, setSubject] = useState("")
  const [bodyHtml, setBodyHtml] = useState("")
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState("")

  const fetchTemplates = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/admin/email-templates", { credentials: "include" })
      const data = await res.json()
      if (data.success) {
        setTemplates(data.templates)
      } else {
        setError(data.error || "목록을 불러오지 못했습니다")
      }
    } catch {
      setError("서버 오류가 발생했습니다")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [])

  const openEdit = (t: EmailTemplate) => {
    setEditing(t)
    setSubject(t.subject)
    setBodyHtml(t.body_html)
    setEditError("")
    setEditOpen(true)
  }

  const handleSave = async () => {
    if (!editing) return
    if (!subject.trim() || !bodyHtml.trim()) {
      setEditError("제목과 본문을 입력해주세요")
      return
    }
    setSaving(true)
    setEditError("")
    try {
      const res = await fetch("/api/admin/email-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: editing.code, subject, body_html: bodyHtml }),
      })
      const data = await res.json()
      if (data.success) {
        setEditOpen(false)
        fetchTemplates()
      } else {
        setEditError(data.error || "저장에 실패했습니다")
      }
    } catch {
      setEditError("서버 오류가 발생했습니다")
    } finally {
      setSaving(false)
    }
  }

  const editingVars = editing ? TEMPLATE_VARS[editing.code] ?? [] : []

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      <div className="rounded-lg border border-warm-tan bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>코드</TableHead>
              <TableHead>이름</TableHead>
              <TableHead>제목</TableHead>
              <TableHead>수정일</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-text-secondary">
                  불러오는 중...
                </TableCell>
              </TableRow>
            ) : templates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-text-secondary">
                  템플릿이 없습니다. 마이그레이션(2026-saas-02-emails.sql)을 실행해주세요.
                </TableCell>
              </TableRow>
            ) : (
              templates.map((t) => (
                <TableRow key={t.code}>
                  <TableCell>
                    <span className="font-mono text-xs">{t.code}</span>
                  </TableCell>
                  <TableCell className="font-medium text-dark">{t.name}</TableCell>
                  <TableCell className="max-w-72 truncate text-sm" title={t.subject}>
                    {t.subject}
                  </TableCell>
                  <TableCell className="text-sm text-text-secondary">
                    {new Date(t.updated_at).toLocaleDateString("ko-KR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => openEdit(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                      편집
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.name}</DialogTitle>
            <DialogDescription>
              <span className="font-mono text-xs">{editing?.code}</span>
            </DialogDescription>
          </DialogHeader>

          {editError && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {editError}
            </div>
          )}

          {editingVars.length > 0 && (
            <div className="rounded-md bg-warm-beige px-4 py-3 text-sm">
              <p className="mb-1 font-medium text-dark">사용 가능한 변수</p>
              <div className="flex flex-wrap gap-1.5">
                {editingVars.map((v) => (
                  <code key={v} className="rounded bg-card px-1.5 py-0.5 font-mono text-xs">
                    {`{{${v}}}`}
                  </code>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="tpl-subject">제목</Label>
              <Input
                id="tpl-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tpl-body">본문 (HTML)</Label>
              <Textarea
                id="tpl-body"
                rows={16}
                className="font-mono text-xs"
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
