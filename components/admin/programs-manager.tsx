"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
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
import { FileUpload } from "@/components/admin/file-upload"
import { Pencil, Trash2, Plus, ChevronRight } from "lucide-react"
import { PROGRAM_STATUS_LABELS } from "@/lib/programs"
import type { Attachment } from "@/lib/db"

interface Program {
  id: number
  title: string
  description: string | null
  category: string | null
  apply_start: string | null
  apply_end: string | null
  submit_deadline: string | null
  status: "draft" | "open" | "closed" | "archived"
  attachments: Attachment[]
  application_count: number
  submission_count: number
}

const EMPTY_FORM = {
  title: "",
  description: "",
  category: "",
  apply_start: "",
  apply_end: "",
  submit_deadline: "",
  status: "draft",
}

function statusBadge(status: Program["status"]) {
  const label = PROGRAM_STATUS_LABELS[status] || status
  if (status === "open") return <Badge>{label}</Badge>
  if (status === "closed") return <Badge variant="outline">{label}</Badge>
  if (status === "archived") return <Badge variant="secondary">{label}</Badge>
  return <Badge variant="secondary">{label}</Badge>
}

export function ProgramsManager() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Program | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")

  const fetchPrograms = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/admin/programs", { credentials: "include" })
      const data = await res.json()
      if (data.success) {
        setPrograms(data.programs)
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
    fetchPrograms()
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setAttachments([])
    setFormError("")
    setFormOpen(true)
  }

  const openEdit = (p: Program) => {
    setEditing(p)
    setForm({
      title: p.title,
      description: p.description || "",
      category: p.category || "",
      apply_start: p.apply_start || "",
      apply_end: p.apply_end || "",
      submit_deadline: p.submit_deadline || "",
      status: p.status,
    })
    setAttachments(Array.isArray(p.attachments) ? p.attachments : [])
    setFormError("")
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) {
      setFormError("제목은 필수입니다")
      return
    }
    // draft → open 전환은 전체 메일이 나가므로 한번 더 확인
    if (editing && editing.status === "draft" && form.status === "open") {
      if (!confirm("모집 중으로 전환하면 모든 입주기업에 공지 메일이 발송됩니다. 계속할까요?")) return
    }
    setSaving(true)
    setFormError("")
    try {
      const body = {
        ...(editing ? { id: editing.id } : {}),
        title: form.title.trim(),
        description: form.description || null,
        category: form.category.trim() || null,
        apply_start: form.apply_start || null,
        apply_end: form.apply_end || null,
        submit_deadline: form.submit_deadline || null,
        status: form.status,
        attachments,
      }
      const res = await fetch("/api/admin/programs", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        setFormOpen(false)
        fetchPrograms()
        if (data.mail) {
          alert(`공지 메일 발송: 성공 ${data.mail.sent}건${data.mail.failed ? `, 실패 ${data.mail.failed}건` : ""}`)
        }
      } else {
        setFormError(data.error || "저장에 실패했습니다")
      }
    } catch {
      setFormError("서버 오류가 발생했습니다")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (p: Program) => {
    if (!confirm(`'${p.title}'을(를) 삭제할까요? 신청·제출 기록도 함께 삭제됩니다.`)) return
    try {
      const res = await fetch(`/api/admin/programs?id=${p.id}`, {
        method: "DELETE",
        credentials: "include",
      })
      const data = await res.json()
      if (data.success) fetchPrograms()
      else alert(data.error || "삭제에 실패했습니다")
    } catch {
      alert("서버 오류가 발생했습니다")
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          프로그램 등록
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      <div className="rounded-lg border border-warm-tan bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>프로그램</TableHead>
              <TableHead>신청 기간</TableHead>
              <TableHead>제출 마감</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-center">신청</TableHead>
              <TableHead className="text-center">제출</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-text-secondary">
                  불러오는 중...
                </TableCell>
              </TableRow>
            ) : programs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-text-secondary">
                  등록된 프로그램이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              programs.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link
                      href={`/admin/programs/${p.id}`}
                      className="group flex items-center gap-1 font-medium text-dark hover:text-gold"
                    >
                      {p.title}
                      <ChevronRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                    {p.category && <div className="text-xs text-text-secondary">{p.category}</div>}
                  </TableCell>
                  <TableCell className="text-sm text-text-secondary">
                    {p.apply_start || "-"} ~ {p.apply_end || "-"}
                  </TableCell>
                  <TableCell className="text-sm text-text-secondary">{p.submit_deadline || "-"}</TableCell>
                  <TableCell>{statusBadge(p.status)}</TableCell>
                  <TableCell className="text-center">{p.application_count}</TableCell>
                  <TableCell className="text-center">{p.submission_count}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDelete(p)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "프로그램 수정" : "프로그램 등록"}</DialogTitle>
            <DialogDescription>
              작성 중(draft) 상태에서 모집 중(open)으로 바꾸면 전체 입주기업에 공지 메일이 발송됩니다
            </DialogDescription>
          </DialogHeader>

          {formError && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {formError}
            </div>
          )}

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="p-title">제목 *</Label>
              <Input
                id="p-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="p-category">분류</Label>
                <Input
                  id="p-category"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="지원사업 / 교육"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="p-status">상태</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger id="p-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">작성 중</SelectItem>
                    <SelectItem value="open">모집 중</SelectItem>
                    <SelectItem value="closed">모집 마감</SelectItem>
                    <SelectItem value="archived">보관됨</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-desc">공고 내용</Label>
              <Textarea
                id="p-desc"
                rows={6}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="p-start">신청 시작</Label>
                <Input
                  id="p-start"
                  type="date"
                  value={form.apply_start}
                  onChange={(e) => setForm({ ...form, apply_start: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="p-end">신청 마감</Label>
                <Input
                  id="p-end"
                  type="date"
                  value={form.apply_end}
                  onChange={(e) => setForm({ ...form, apply_end: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="p-deadline">제출 마감</Label>
                <Input
                  id="p-deadline"
                  type="date"
                  value={form.submit_deadline}
                  onChange={(e) => setForm({ ...form, submit_deadline: e.target.value })}
                />
              </div>
            </div>
            <FileUpload value={attachments} onChange={setAttachments} folder="programs" label="공고문 첨부" />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
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
