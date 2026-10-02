"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import { BusyButton, CardSkeleton, CountBadge, EmptyState, Notice, StatusBadge, toastSuccess, useConfirm, useDelayedFlag } from "@/components/saas"
import { dateShort, dateTime } from "@/lib/format"
import { friendlyError, MSG } from "@/lib/messages"
import { statusMeta } from "@/lib/status"
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

const d = (v: string | null) => (v ? dateShort(v) : "-")

/**
 * 프로그램 상세(신청·제출물). 계획서 4.1.7: 선정/미선정 → useConfirm, 실패 → Notice.
 * mailEnabled는 서버 page가 넘긴다(메일 꺼짐이면 "결과 메일" 약속 문구를 쓰지 않는다).
 */
export function ProgramDetail({
  programId,
  mailEnabled = false,
  initialTab = "applications",
}: {
  programId: number
  mailEnabled?: boolean
  initialTab?: "applications" | "submissions"
}) {
  const ask = useConfirm()
  const router = useRouter()
  const [actionError, setActionError] = useState("")
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
      else setError(friendlyError(pRes.status, pData.error, MSG.loadFailed))
      if (aData.success) setApplications(aData.applications)
      if (sData.success) setSubmissions(sData.submissions)
    } catch {
      setError(friendlyError(0, null, MSG.loadFailed))
    } finally {
      setLoading(false)
    }
  }, [programId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const handleApplicationStatus = async (app: Application, status: "accepted" | "rejected") => {
    const label = status === "accepted" ? "선정" : "미선정"
    if (
      !(await ask({
        title: mailEnabled
          ? `${app.tenant_name} 신청을 ${label}으로 정하고 결과 메일을 보낼까요?`
          : `${app.tenant_name} 신청을 ${label}으로 정할까요?`,
        body: mailEnabled ? undefined : "메일 발송이 설정되지 않아 결과 메일은 나가지 않아요. 결과는 기업에 직접 알려 주세요.",
        summary: program ? [{ label: "프로그램", value: program.title }] : undefined,
        confirmLabel: mailEnabled ? `${label}으로 정하고 메일 보내기` : `${label}으로 정하기`,
        tone: status === "rejected" ? "danger" : "default",
      }))
    )
      return
    setActingId(app.id)
    setActionError("")
    try {
      const res = await fetch("/api/admin/applications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: app.id, status }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        toastSuccess(`${app.tenant_name} 신청을 ${label}으로 정했어요`)
        router.refresh() // 사이드바 배지·홈 할 일 합계 갱신(2.0)
      } else setActionError(friendlyError(res.status, data.error, "처리하지 못했어요."))
      fetchAll()
    } catch {
      setActionError(friendlyError(0, null, "처리하지 못했어요."))
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
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setReviewOpen(false)
        toastSuccess(`${reviewing.tenant_name} 제출물 검토를 저장했어요`)
        fetchAll()
        router.refresh() // 사이드바 "프로그램" 배지·홈 할 일 합계 갱신(2.0)
      } else {
        setReviewError(friendlyError(res.status, data.error, MSG.saveFailed))
      }
    } catch {
      setReviewError(friendlyError(0, null, MSG.saveFailed))
    } finally {
      setReviewSaving(false)
    }
  }

  if (loading && !program) {
    return <DetailLoading />
  }
  if (error || !program) {
    return (
      <EmptyState
        kind="error"
        bordered
        title="프로그램을 불러오지 못했어요"
        description={error || MSG.notFound}
        onRetry={fetchAll}
        action={
          <Button variant="outline" size="sm" asChild className="hover:bg-warm-beige hover:text-dark">
            <Link href="/admin/programs">프로그램 목록으로</Link>
          </Button>
        }
      />
    )
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/programs"
          className="mb-2 inline-flex min-h-8 items-center gap-1 text-[15px] text-link underline underline-offset-2 hover:text-dark"
        >
          <ArrowLeft className="size-4" aria-hidden />
          프로그램
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-dark">{program.title}</h1>
          <StatusBadge domain="program" status={program.status} />
        </div>
        <p className="mt-1 text-base text-text-secondary">
          신청 {d(program.apply_start)} ~ {d(program.apply_end)} · 제출 마감 {d(program.submit_deadline)}
        </p>
      </div>

      {actionError && (
        <Notice tone="danger" className="mb-4" onClose={() => setActionError("")}>
          {actionError}
        </Notice>
      )}

      <Tabs defaultValue={initialTab} className="gap-0">
        {/* 하위 탭 모양은 SubNav와 같게(밑줄 탭 + 중립 건수 배지) */}
        <TabsList aria-label="프로그램 상세 보기" className="mb-4 h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-warm-tan bg-transparent p-0">
          {(
            [
              { value: "applications", label: "신청 현황", count: applications.length },
              { value: "submissions", label: "제출물", count: submissions.length },
            ] as const
          ).map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="-mb-px h-auto min-h-11 flex-none gap-1.5 rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 text-[15px] font-medium text-text-secondary shadow-none hover:text-dark data-[state=active]:border-dark data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-dark data-[state=active]:shadow-none sm:px-4"
            >
              {t.label}
              <CountBadge count={t.count} srLabel={`${t.count}건`} />
            </TabsTrigger>
          ))}
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
                      아직 신청한 기업이 없어요
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
                        <span title={dateTime(app.applied_at)}>{d(app.applied_at)}</span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge domain="application" status={app.status} />
                      </TableCell>
                      <TableCell className="text-sm text-text-secondary">
                        {app.submission_status ? statusMeta("submission", app.submission_status).label : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {app.status === "applied" && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              onClick={() => handleApplicationStatus(app, "accepted")}
                              disabled={actingId === app.id}
                            >
                              선정
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleApplicationStatus(app, "rejected")}
                              disabled={actingId === app.id}
                              className="hover:bg-warm-beige hover:text-dark"
                            >
                              미선정
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
                      아직 제출물이 없어요
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
                      <TableCell>
                        <StatusBadge domain="submission" status={sub.status} />
                      </TableCell>
                      <TableCell className="text-sm text-text-secondary">
                        <span title={dateTime(sub.updated_at || sub.submitted_at)}>{d(sub.updated_at || sub.submitted_at)}</span>
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
              {mailEnabled
                ? "승인·반려·보완 요청으로 저장하면 기업에 의견 메일이 가요"
                : "메일 발송이 설정되지 않아 의견 메일은 나가지 않아요. 기업은 포털에서 결과를 볼 수 있어요"}
            </DialogDescription>
          </DialogHeader>

          {reviewError && <Notice tone="danger">{reviewError}</Notice>}

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
                <Label htmlFor="r-status">검토 결과</Label>
                <Select value={reviewStatus} onValueChange={setReviewStatus}>
                  <SelectTrigger id="r-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reviewing">검토 중(메일 없음)</SelectItem>
                    <SelectItem value="approved">승인</SelectItem>
                    <SelectItem value="rejected">반려</SelectItem>
                    <SelectItem value="resubmit_requested">보완 요청</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="r-feedback">검토 의견</Label>
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
            <Button variant="outline" onClick={() => setReviewOpen(false)} disabled={reviewSaving} className="hover:bg-warm-beige hover:text-dark">
              닫기
            </Button>
            <BusyButton busy={reviewSaving} onClick={handleReviewSave}>
              검토 저장하기
            </BusyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetailLoading() {
  const show = useDelayedFlag(true)
  return show ? <CardSkeleton lines={5} label="프로그램을 불러오는 중…" /> : <div className="min-h-40" aria-hidden />
}
