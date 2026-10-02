"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
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
import { BusyButton, EmptyState, Notice, StatusBadge, TableSkeleton, toastSuccess, useConfirm, useDelayedFlag } from "@/components/saas"
import { dateShort } from "@/lib/format"
import { friendlyError, MSG } from "@/lib/messages"
import { emailsHref } from "@/lib/links"
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

const d = (v: string | null) => (v ? dateShort(v) : "-")

/** failedLink: 보내지 못한 메일 보기 / logLink: 공지 메일 기록 보기(결과 건수를 응답으로 받지 못했을 때) */
type MailResult = { tone: "success" | "warning" | "info"; text: string; failedLink: boolean; logLink?: boolean }

/**
 * 프로그램 목록·등록·수정(계획서 4.1.7: 브라우저 팝업 → useConfirm·Notice).
 * mailEnabled·recipientCount는 서버 page가 넘긴다(공지 메일 문구를 메일 꺼짐에 맞춰 바꾸려고).
 */
export function ProgramsManager({ mailEnabled = false, recipientCount = null }: { mailEnabled?: boolean; recipientCount?: number | null }) {
  const who = recipientCount === null ? "입주기업 전체" : `입주기업 ${recipientCount}곳`
  const whoShort = recipientCount === null ? "전체" : `${recipientCount}곳`
  const ask = useConfirm()
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [mailResult, setMailResult] = useState<MailResult | null>(null)
  const [actionError, setActionError] = useState("")
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const showSkeleton = useDelayedFlag(loading)

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
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setPrograms(data.programs)
      } else {
        setError(friendlyError(res.status, data.error, MSG.loadFailed))
      }
    } catch {
      setError(friendlyError(0, null, MSG.loadFailed))
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
      setFormError("제목을 입력해 주세요")
      document.getElementById("p-title")?.focus()
      return
    }
    // 작성 중 → 모집 중(또는 처음부터 모집 중으로 등록)은 입주기업 전체에 공지 메일이 나가므로 한 번 더 확인
    const opening = form.status === "open" && (!editing || editing.status === "draft")
    if (opening) {
      const ok = mailEnabled
        ? await ask({
            title: `모집을 시작하고 ${who}에 메일을 보낼까요?`,
            summary: [{ label: "프로그램", value: form.title.trim() }],
            consequences: ["보낸 공지 메일은 되돌릴 수 없어요"],
            confirmLabel: `모집 시작하고 ${whoShort}에 메일 보내기`,
          })
        : await ask({
            title: "모집을 시작할까요?",
            body: "메일 발송이 설정되지 않아 공지 메일은 나가지 않아요.",
            summary: [{ label: "프로그램", value: form.title.trim() }],
            confirmLabel: "모집 시작하기",
          })
      if (!ok) return
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
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setFormOpen(false)
        fetchPrograms()
        setActionError("")
        if (opening && !mailEnabled) {
          setMailResult({ tone: "info", text: "모집을 시작했어요. 메일 발송이 설정되지 않아 공지 메일은 나가지 않았어요.", failedLink: false })
        } else if (data.mail) {
          const { sent, failed } = data.mail as { sent: number; failed: number }
          setMailResult(
            failed > 0
              ? { tone: "warning", text: `모집을 시작했어요. 공지 메일 ${sent + failed}건 중 ${failed}건을 보내지 못했어요.`, failedLink: true }
              : { tone: "success", text: `모집을 시작하고 공지 메일 ${sent}건을 보냈어요.`, failedLink: false },
          )
        } else if (opening && !editing) {
          // 처음부터 모집 중으로 등록하면 POST가 공지 메일을 보내지만 결과 건수를 돌려주지 않는다(API는 그대로 둔다)
          setMailResult({
            tone: "info",
            text: "프로그램을 등록하고 모집을 시작했어요. 공지 메일을 몇 건 보냈는지는 메일 화면에서 확인해 주세요.",
            failedLink: false,
            logLink: true,
          })
        } else {
          toastSuccess(editing ? "프로그램을 저장했어요" : "프로그램을 등록했어요")
        }
      } else {
        setFormError(friendlyError(res.status, data.error, MSG.saveFailed))
      }
    } catch {
      setFormError(friendlyError(0, null, MSG.saveFailed))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (p: Program) => {
    if (
      !(await ask({
        title: `‘${p.title}’ 프로그램을 삭제할까요?`,
        consequences: [`신청 ${p.application_count}건·제출 ${p.submission_count}건도 함께 지워져요`, "되돌릴 수 없어요"],
        confirmLabel: "삭제하기",
        tone: "danger",
      }))
    )
      return
    setDeletingId(p.id)
    setActionError("")
    try {
      const res = await fetch(`/api/admin/programs?id=${p.id}`, {
        method: "DELETE",
        credentials: "include",
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        toastSuccess(`‘${p.title}’ 프로그램을 삭제했어요`)
        fetchPrograms()
      } else setActionError(friendlyError(res.status, data.error, MSG.deleteFailed))
    } catch {
      setActionError(friendlyError(0, null, MSG.deleteFailed))
    } finally {
      setDeletingId(null)
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

      {mailResult && (
        <Notice
          tone={mailResult.tone}
          className="mb-4"
          onClose={() => setMailResult(null)}
          action={
            mailResult.failedLink ? (
              <Link href={emailsHref({ status: "failed" })} className="text-link underline underline-offset-2">
                보내지 못한 메일 보기
              </Link>
            ) : mailResult.logLink ? (
              <Link href={emailsHref({ type: "program_notice" })} className="text-link underline underline-offset-2">
                공지 메일 기록 보기
              </Link>
            ) : undefined
          }
        >
          {mailResult.text}
        </Notice>
      )}
      {actionError && (
        <Notice tone="danger" className="mb-4" onClose={() => setActionError("")}>
          {actionError}
        </Notice>
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
                <TableCell colSpan={7} className="p-0">
                  {showSkeleton ? <TableSkeleton rows={4} columns={5} className="rounded-none border-0" label="프로그램을 불러오는 중…" /> : <div className="min-h-24" />}
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <EmptyState kind="error" compact title="프로그램을 불러오지 못했어요" description={error} onRetry={fetchPrograms} />
                </TableCell>
              </TableRow>
            ) : programs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <EmptyState compact title="아직 등록한 프로그램이 없어요" description="[프로그램 등록]으로 첫 공고를 올려요" />
                </TableCell>
              </TableRow>
            ) : (
              programs.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link
                      href={`/admin/programs/${p.id}`}
                      className="group flex items-center gap-1 font-medium text-dark underline-offset-2 hover:underline"
                    >
                      {p.title}
                      <ChevronRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                    {p.category && <div className="text-xs text-text-secondary">{p.category}</div>}
                  </TableCell>
                  <TableCell className="text-sm text-text-secondary">
                    {d(p.apply_start)} ~ {d(p.apply_end)}
                  </TableCell>
                  <TableCell className="text-sm text-text-secondary">{d(p.submit_deadline)}</TableCell>
                  <TableCell>
                    <StatusBadge domain="program" status={p.status} />
                  </TableCell>
                  <TableCell className="text-center">{p.application_count}</TableCell>
                  <TableCell className="text-center">{p.submission_count}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="icon-sm" onClick={() => openEdit(p)} aria-label={`${p.title} 수정`} title="수정" className="hover:bg-warm-beige hover:text-dark">
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        onClick={() => handleDelete(p)}
                        disabled={deletingId === p.id}
                        aria-label={`${p.title} 삭제`}
                        title="삭제"
                        className="hover:bg-red-50 hover:text-red-800"
                      >
                        <Trash2 className="size-4" aria-hidden />
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
              {mailEnabled
                ? "작성 중에서 모집 중으로 바꾸면 입주기업 전체에 공지 메일이 나가요"
                : "메일 발송이 설정되지 않아 모집을 시작해도 공지 메일은 나가지 않아요"}
            </DialogDescription>
          </DialogHeader>

          {formError && <Notice tone="danger">{formError}</Notice>}

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="p-title">제목(필수)</Label>
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
                    <SelectItem value="archived">보관</SelectItem>
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
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving} className="hover:bg-warm-beige hover:text-dark">
              닫기
            </Button>
            <BusyButton busy={saving} onClick={handleSave}>
              {editing ? "저장하기" : "등록하기"}
            </BusyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
