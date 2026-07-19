"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PortalFileUpload } from "@/components/portal/portal-file-upload"
import { AttachmentList } from "@/components/attachment-list"
import { ArrowLeft, FileText, Send } from "lucide-react"
import { APPLICATION_STATUS_LABELS, SUBMISSION_STATUS_LABELS, todayKST } from "@/lib/programs"
import type { Attachment } from "@/lib/db"

interface ProgramDetail {
  id: number
  title: string
  description: string | null
  category: string | null
  status: "open" | "closed"
  attachments: Attachment[]
  apply_start: string | null
  apply_end: string | null
  submit_deadline: string | null
  application_id: number | null
  application_status: string | null
  applied_at: string | null
  submission_id: number | null
  submission_title: string | null
  submission_note: string | null
  submission_attachments: Attachment[] | null
  submission_status: string | null
  feedback: string | null
  submitted_at: string | null
  submission_updated_at: string | null
}

export default function PortalProgramDetailPage() {
  const params = useParams<{ id: string }>()
  const [program, setProgram] = useState<ProgramDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [applying, setApplying] = useState(false)

  // 제출 폼
  const [subTitle, setSubTitle] = useState("")
  const [subNote, setSubNote] = useState("")
  const [subFiles, setSubFiles] = useState<Attachment[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [subError, setSubError] = useState("")
  const [subOk, setSubOk] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/portal/programs?id=${params.id}`, { credentials: "include" })
      const data = await res.json()
      if (data.success) {
        const p: ProgramDetail = data.program
        setProgram(p)
        setSubTitle(p.submission_title || "")
        setSubNote(p.submission_note || "")
        setSubFiles(Array.isArray(p.submission_attachments) ? p.submission_attachments : [])
      } else {
        setError(data.error || "프로그램을 불러오지 못했습니다")
      }
    } catch {
      setError("서버 오류가 발생했습니다")
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    load()
  }, [load])

  const handleApply = async () => {
    if (!program) return
    if (!confirm(`'${program.title}'에 신청할까요?`)) return
    setApplying(true)
    try {
      const res = await fetch("/api/portal/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ program_id: program.id }),
      })
      const data = await res.json()
      if (!data.success) alert(data.error || "신청에 실패했습니다")
      load()
    } catch {
      alert("서버 오류가 발생했습니다")
    } finally {
      setApplying(false)
    }
  }

  const handleSubmit = async () => {
    if (!program) return
    setSubmitting(true)
    setSubError("")
    setSubOk("")
    try {
      const isUpdate = program.submission_id !== null
      const res = await fetch("/api/portal/submissions", {
        method: isUpdate ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          isUpdate
            ? { id: program.submission_id, title: subTitle, note: subNote, attachments: subFiles }
            : { program_id: program.id, title: subTitle, note: subNote, attachments: subFiles }
        ),
      })
      const data = await res.json()
      if (data.success) {
        setSubOk("제출되었습니다")
        load()
      } else {
        setSubError(data.error || "제출에 실패했습니다")
      }
    } catch {
      setSubError("서버 오류가 발생했습니다")
    } finally {
      setSubmitting(false)
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
          <Link href="/portal/programs">
            <ArrowLeft className="h-4 w-4" />
            목록으로
          </Link>
        </Button>
      </div>
    )
  }

  const today = todayKST()
  const applyOpen =
    program.status === "open" &&
    (!program.apply_start || today >= program.apply_start) &&
    (!program.apply_end || today <= program.apply_end)
  const isAccepted = program.application_status === "accepted"
  const deadlinePassed = !!program.submit_deadline && today > program.submit_deadline
  const canEditSubmission =
    isAccepted &&
    !deadlinePassed &&
    (program.submission_id === null ||
      program.submission_status === "submitted" ||
      program.submission_status === "resubmit_requested")

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/portal/programs"
          className="mb-2 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-dark"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          프로그램 목록
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-dark">{program.title}</h1>
          {program.status === "closed" && <Badge variant="secondary">모집 마감</Badge>}
          {program.application_status && (
            <Badge variant={isAccepted ? "default" : "secondary"}>
              {APPLICATION_STATUS_LABELS[program.application_status] || program.application_status}
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          {program.category && `${program.category} · `}
          신청 {program.apply_start || "-"} ~ {program.apply_end || "-"}
          {program.submit_deadline && ` · 제출 마감 ${program.submit_deadline}`}
        </p>
      </div>

      <div className="grid gap-6">
        {/* 공고 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">공고 내용</CardTitle>
          </CardHeader>
          <CardContent>
            {program.description ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-dark">{program.description}</p>
            ) : (
              <p className="text-sm text-text-secondary">공고 내용이 없습니다</p>
            )}
            {Array.isArray(program.attachments) && program.attachments.length > 0 && (
              <div className="mt-4 border-t border-warm-tan pt-4">
                <AttachmentList attachments={program.attachments} />
              </div>
            )}

            {!program.application_status && (
              <div className="mt-4 border-t border-warm-tan pt-4">
                {applyOpen ? (
                  <Button onClick={handleApply} disabled={applying}>
                    {applying ? "신청 중..." : "신청하기"}
                  </Button>
                ) : (
                  <p className="text-sm text-text-secondary">
                    {program.status !== "open" ? "모집이 마감되었습니다" : "신청 기간이 아닙니다"}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 제출 */}
        {program.application_status && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-gold" />
                자료 제출
                {program.submission_status && (
                  <Badge
                    variant={
                      program.submission_status === "resubmit_requested" || program.submission_status === "rejected"
                        ? "destructive"
                        : program.submission_status === "approved"
                          ? "default"
                          : "outline"
                    }
                  >
                    {SUBMISSION_STATUS_LABELS[program.submission_status] || program.submission_status}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!isAccepted ? (
                <p className="text-sm text-text-secondary">
                  {program.application_status === "applied"
                    ? "선정 결과를 기다리고 있습니다. 선정되면 자료를 제출할 수 있습니다."
                    : "선정된 기업만 자료를 제출할 수 있습니다."}
                </p>
              ) : (
                <div className="grid gap-4">
                  {program.feedback && (
                    <div className="rounded-md bg-warm-beige px-4 py-3 text-sm">
                      <p className="mb-1 font-medium text-dark">검토 의견</p>
                      <p className="whitespace-pre-line text-text-secondary">{program.feedback}</p>
                    </div>
                  )}
                  {program.submitted_at && (
                    <p className="text-xs text-text-secondary">
                      최초 제출: {new Date(program.submitted_at).toLocaleString("ko-KR")}
                      {program.submission_updated_at &&
                        program.submission_updated_at !== program.submitted_at &&
                        ` · 마지막 수정: ${new Date(program.submission_updated_at).toLocaleString("ko-KR")}`}
                    </p>
                  )}

                  {canEditSubmission ? (
                    <>
                      {subError && (
                        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                          {subError}
                        </div>
                      )}
                      {subOk && (
                        <div className="rounded-md bg-warm-beige px-4 py-3 text-sm text-dark">{subOk}</div>
                      )}
                      <div className="grid gap-1.5">
                        <Label htmlFor="s-title">제목</Label>
                        <Input
                          id="s-title"
                          value={subTitle}
                          onChange={(e) => setSubTitle(e.target.value)}
                          placeholder="제출 자료 제목"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="s-note">메모</Label>
                        <Textarea
                          id="s-note"
                          rows={3}
                          value={subNote}
                          onChange={(e) => setSubNote(e.target.value)}
                        />
                      </div>
                      <PortalFileUpload value={subFiles} onChange={setSubFiles} label="제출 파일" />
                      <div>
                        <Button onClick={handleSubmit} disabled={submitting}>
                          <Send className="h-4 w-4" />
                          {submitting
                            ? "제출 중..."
                            : program.submission_status === "resubmit_requested"
                              ? "재제출"
                              : program.submission_id
                                ? "수정 제출"
                                : "제출"}
                        </Button>
                        {program.submit_deadline && (
                          <p className="mt-1.5 text-xs text-text-secondary">
                            제출 마감: {program.submit_deadline}
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div>
                      {deadlinePassed && program.submission_id === null ? (
                        <p className="text-sm text-destructive">제출 마감일이 지났습니다</p>
                      ) : program.submission_id ? (
                        <div className="grid gap-2">
                          <p className="text-sm font-medium text-dark">{program.submission_title || "(제목 없음)"}</p>
                          {program.submission_note && (
                            <p className="whitespace-pre-line text-sm text-text-secondary">
                              {program.submission_note}
                            </p>
                          )}
                          {Array.isArray(program.submission_attachments) &&
                            program.submission_attachments.length > 0 && (
                              <AttachmentList attachments={program.submission_attachments} />
                            )}
                          {deadlinePassed && (
                            <p className="text-xs text-text-secondary">제출 마감일이 지나 수정할 수 없습니다</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
