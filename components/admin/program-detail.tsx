"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { ArrowLeft, FileText } from "lucide-react"
import {
  APPLICATION_STATUS_LABELS,
  SUBMISSION_STATUS_LABELS,
  PROGRAM_STATUS_LABELS,
} from "@/lib/programs"
import { AttachmentList } from "@/components/attachment-list"
import type { Attachment } from "@/lib/db"

interface Program {
  id: number
  title: string
  category: string | null
  status: string
  apply_start: string | null
  apply_end: string | null
  submit_deadline: string | null
}

interface Application {
  id: number
  tenant_id: number
  tenant_name: string
  room_no: string | null
  status: "applied" | "accepted" | "rejected" | "completed"
  applied_at: string
  submission_id: number | null
  submission_status: string | null
}

interface Submission {
  id: number
  tenant_id: number
  tenant_name: string
  room_no: string | null
  title: string | null
  note: string | null
  attachments: Attachment[]
  status: "submitted" | "reviewing" | "approved" | "rejected" | "resubmit_requested"
  feedback: string | null
  submitted_at: string
  updated_at: string
}

function appBadge(status: Application["status"]) {
  const label = APPLICATION_STATUS_LABELS[status] || status
  if (status === "accepted") return <Badge className="bg-green-700 text-white">{label}</Badge>
  if (status === "rejected") return <Badge variant="destructive">{label}</Badge>
  if (status === "completed") return <Badge variant="outline">{label}</Badge>
  return <Badge variant="secondary">{label}</Badge>
}

function subBadge(status: Submission["status"]) {
  const label = SUBMISSION_STATUS_LABELS[status] || status
  if (status === "approved") return <Badge className="bg-green-700 text-white">{label}</Badge>
  if (status === "rejected") return <Badge variant="destructive">{label}</Badge>
  if (status === "resubmit_requested") return <Badge variant="destructive">{label}</Badge>
  if (status === "reviewing") return <Badge variant="outline">{label}</Badge>
  return <Badge variant="secondary">{label}</Badge>
}

export function ProgramDetail({ programId }: { programId: number }) {
  const [program, setProgram] = useState<Program | null>(null)
  const [applications, setApplications] = useState<Application[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [actingId, setActingId] = useState<number | null>(null)

  // 검토 Dialog
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewing, setReviewing] = useState<Submission | null>(null)
  const [reviewStatus, setReviewStatus] = useState("reviewing")
  const [feedback, setFeedback] = useState("")
  const [reviewSaving, setReviewSaving] = useState(false)
  const [reviewError, setReviewError] = useState("")

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [pRes, aRes, sRes] = await Promise.all([
        fetch(`/api/admin/programs?id=${programId}`, { credentials: "include" }),
        fetch(`/api/admin/applications?program_id=${programId}`, { credentials: "include" }),
        fetch(`/api/admin/submissions?program_id=${programId}`, { credentials: "include" }),
      ])
      const [pData, aData, sData] = await Promise.all([pRes.json(), aRes.json(), sRes.json()])
      if (pData.success) setProgram(pData.program)
      else setError(pData.error || "프로그램을 불러오지 못했습니다")
      if (aData.success) setApplications(aData.applications)
      if (sData.success) setSubmissions(sData.submissions)
    } catch {
      setError("서버 오류가 발생했습니다")
    } finally {
      setLoading(false)
    }
  }, [programId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const handleApplicationStatus = async (app: Application, status: "accepted" | "rejected") => {
    const actionLabel = status === "accepted" ? "승인(선정)" : "반려(미선정)"
    if (!confirm(`${app.tenant_name}의 신청을 ${actionLabel} 처리할까요? 결과 메일이 발송됩니다.`)) return
    setActingId(app.id)
    try {
      const res = await fetch("/api/admin/applications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: app.id, status }),
      })
      const data = await res.json()
      if (!data.success) alert(data.error || "처리에 실패했습니다")
      fetchAll()
    } catch {
      alert("서버 오류가 발생했습니다")
    } finally {
      setActingId(null)
    }
  }

  const openReview = (sub: Submission) => {
    setReviewing(sub)
    setReviewStatus(sub.status === "submitted" ? "reviewing" : sub.status)
    setFeedback(sub.feedback || "")
    setReviewError("")
    setReviewOpen(true)
  }

  const handleReviewSave = async () => {
    if (!reviewing) return
    setReviewSaving(true)
    setReviewError("")
    try {
      const res = await fetch("/api/admin/submissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: reviewing.id, status: reviewStatus, feedback }),
      })
      const data = await res.json()
      if (data.success) {
        setReviewOpen(false)
        fetchAll()
      } else {
        setReviewError(data.error || "저장에 실패했습니다")
      }
    } catch {
      setReviewError("서버 오류가 발생했습니다")
    } finally {
      setReviewSaving(false)
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-text-secondary">불러오는 중...</p>
  }
  if (error || !program) {
    return (
      <div className="py-10 text-center">
        <p className="mb-4 text-sm text-destructive">{error || "프로그램을 찾을 수 없습니다"}</p>
        <Button variant="outline" asChild>
          <Link href="/admin/programs">
            <ArrowLeft className="h-4 w-4" />
            목록으로
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/programs"
          className="mb-2 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-dark"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          프로그램 목록
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-dark">{program.title}</h1>
          <Badge variant="outline">{PROGRAM_STATUS_LABELS[program.status] || program.status}</Badge>
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          신청 {program.apply_start || "-"} ~ {program.apply_end || "-"} · 제출 마감{" "}
          {program.submit_deadline || "-"}
        </p>
      </div>

      <Tabs defaultValue="applications">
        <TabsList>
          <TabsTrigger value="applications">신청 현황 ({applications.length})</TabsTrigger>
          <TabsTrigger value="submissions">제출물 ({submissions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="applications">
          <div className="rounded-lg border border-warm-tan bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>기업</TableHead>
                  <TableHead>신청일</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>제출</TableHead>
                  <TableHead className="text-right">처리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-text-secondary">
                      신청한 기업이 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  applications.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell>
                        <div className="font-medium text-dark">{app.tenant_name}</div>
                        {app.room_no && <div className="text-xs text-text-secondary">{app.room_no}</div>}
                      </TableCell>
                      <TableCell className="text-sm text-text-secondary">
                        {new Date(app.applied_at).toLocaleDateString("ko-KR")}
                      </TableCell>
                      <TableCell>{appBadge(app.status)}</TableCell>
                      <TableCell className="text-sm text-text-secondary">
                        {app.submission_status
                          ? SUBMISSION_STATUS_LABELS[app.submission_status] || app.submission_status
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {app.status === "applied" && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              onClick={() => handleApplicationStatus(app, "accepted")}
                              disabled={actingId === app.id}
                            >
                              승인
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleApplicationStatus(app, "rejected")}
                              disabled={actingId === app.id}
                            >
                              반려
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="submissions">
          <div className="rounded-lg border border-warm-tan bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>기업</TableHead>
                  <TableHead>제목</TableHead>
                  <TableHead>파일</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>제출일</TableHead>
                  <TableHead className="text-right">검토</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-text-secondary">
                      제출물이 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  submissions.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell>
                        <div className="font-medium text-dark">{sub.tenant_name}</div>
                        {sub.room_no && <div className="text-xs text-text-secondary">{sub.room_no}</div>}
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-sm" title={sub.title || ""}>
                        {sub.title || "-"}
                      </TableCell>
                      <TableCell>
                        {Array.isArray(sub.attachments) && sub.attachments.length > 0 ? (
                          <div className="min-w-52">
                            <AttachmentList attachments={sub.attachments} />
                          </div>
                        ) : (
                          <span className="text-xs text-text-secondary">없음</span>
                        )}
                      </TableCell>
                      <TableCell>{subBadge(sub.status)}</TableCell>
                      <TableCell className="text-sm text-text-secondary">
                        {new Date(sub.updated_at || sub.submitted_at).toLocaleDateString("ko-KR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => openReview(sub)}>
                          <FileText className="h-3.5 w-3.5" />
                          검토
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* 검토 Dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>제출물 검토 — {reviewing?.tenant_name}</DialogTitle>
            <DialogDescription>
              승인/반려/재제출 요청으로 저장하면 피드백 메일이 발송됩니다
            </DialogDescription>
          </DialogHeader>

          {reviewError && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {reviewError}
            </div>
          )}

          {reviewing && (
            <div className="grid gap-4">
              <div className="rounded-md bg-warm-beige px-4 py-3 text-sm">
                <p className="font-medium text-dark">{reviewing.title || "(제목 없음)"}</p>
                {reviewing.note && (
                  <p className="mt-1 whitespace-pre-line text-text-secondary">{reviewing.note}</p>
                )}
                {Array.isArray(reviewing.attachments) && reviewing.attachments.length > 0 && (
                  <div className="mt-2">
                    <AttachmentList attachments={reviewing.attachments} />
                  </div>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label>검토 결과</Label>
                <Select value={reviewStatus} onValueChange={setReviewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reviewing">검토 중 (메일 없음)</SelectItem>
                    <SelectItem value="approved">승인</SelectItem>
                    <SelectItem value="rejected">반려</SelectItem>
                    <SelectItem value="resubmit_requested">재제출 요청</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="r-feedback">피드백</Label>
                <Textarea
                  id="r-feedback"
                  rows={4}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="기업에 전달할 검토 의견"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)} disabled={reviewSaving}>
              취소
            </Button>
            <Button onClick={handleReviewSave} disabled={reviewSaving}>
              {reviewSaving ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
