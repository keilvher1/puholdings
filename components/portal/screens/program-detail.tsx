"use client"

// 포털 프로그램 상세·신청·자료 제출 본문(WP8, 계획서 4.5.7). 조회·저장은 기존 /api/portal/programs·applications·submissions.
//   제목 → '지금 단계' 상자(ProgramStage) → 공고 내용·첨부 → 자료 제출(id="submit", 한 열: 준비할 것 → 파일 → 자료 이름 → 남길 말)
//   신청은 ConfirmDialog(브라우저 확인 창 없음), 실패는 대화상자 안 Notice, 성공은 토스트 + 단계 상자 갱신.
//   빈 제출은 칸 오류(서버 요청 없음). 4MB 넘는 파일은 PortalFileUpload가 요청 없이 칸 아래에 안내한다.
//   시각은 "10월 1일 오후 2:20"(초 없음). 메일이 꺼져 있으면 메일 약속 문구를 쓰지 않는다(mailEnabled = 서버 isMailEnabled()).

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AttachmentList } from "@/components/attachment-list"
import {
  BusyButton,
  CardSkeleton,
  ConfirmDialog,
  EmptyState,
  ErrorSummary,
  Notice,
  PageHeader,
  toastSuccess,
  useDelayedFlag,
  useFieldErrors,
} from "@/components/saas"
import { PortalFileUpload, PORTAL_UPLOAD_MAX_LABEL } from "@/components/portal/portal-file-upload"
import { ProgramStage } from "@/components/portal/program-stage"
import { dateTime, todayKST } from "@/lib/format"
import { friendlyError, MSG } from "@/lib/messages"
import { PORTAL_PROGRAMS_HELP } from "@/lib/help/portal"
import type { Attachment } from "@/lib/db"
import { dateRange, isSubmitClosed, monthDay, submitDueText } from "./portal-model"

interface ProgramDetail {
  id: number
  title: string
  description: string | null
  category: string | null
  status: string
  attachments: Attachment[] | null
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

type LoadState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "not_found" } | { kind: "ok"; program: ProgramDetail }

function BackLink() {
  return (
    <Link
      href="/portal/programs"
      className="-ml-1 mb-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-base text-link underline underline-offset-2 hover:text-dark"
    >
      <ArrowLeft className="size-4" aria-hidden />
      프로그램 목록
    </Link>
  )
}

export function PortalProgramDetail({ programId, mailEnabled, phone }: { programId: string; mailEnabled: boolean; phone: string }) {
  const router = useRouter()
  const today = todayKST()
  const [state, setState] = useState<LoadState>({ kind: "loading" })
  const [applyOpen, setApplyOpen] = useState(false)

  // 제출 폼
  const [subTitle, setSubTitle] = useState("")
  const [subNote, setSubNote] = useState("")
  const [subFiles, setSubFiles] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [subError, setSubError] = useState("")
  const [subOk, setSubOk] = useState("")
  const fe = useFieldErrors({ files: "제출 파일" })

  const load = useCallback(
    async (keepForm = false) => {
      try {
        const res = await fetch(`/api/portal/programs?id=${encodeURIComponent(programId)}`, { credentials: "include" })
        const data = await res.json().catch(() => ({}))
        if (res.status === 404 || res.status === 400) return setState({ kind: "not_found" })
        if (!res.ok || !data.success) return setState({ kind: "error", message: friendlyError(res.status, data.error, MSG.loadFailed) })
        const p: ProgramDetail = data.program
        setState({ kind: "ok", program: p })
        if (!keepForm) {
          setSubTitle(p.submission_title || "")
          setSubNote(p.submission_note || "")
          setSubFiles(Array.isArray(p.submission_attachments) ? p.submission_attachments : [])
        }
      } catch {
        setState({ kind: "error", message: friendlyError(0, null, MSG.loadFailed) })
      }
    },
    [programId],
  )

  useEffect(() => {
    load()
  }, [load])

  // 홈·목록의 [제출하기](#submit)로 왔으면 내용이 그려진 뒤 제출 칸으로 내린다
  const loaded = state.kind === "ok"
  useEffect(() => {
    if (loaded && typeof window !== "undefined" && window.location.hash === "#submit") {
      requestAnimationFrame(() => document.getElementById("submit")?.scrollIntoView({ block: "start" }))
    }
  }, [loaded])

  const showSkeleton = useDelayedFlag(state.kind === "loading")
  if (state.kind === "loading") {
    return (
      <div>
        <BackLink />
        {showSkeleton && <CardSkeleton lines={4} label="프로그램을 불러오는 중…" />}
      </div>
    )
  }
  if (state.kind === "not_found") {
    return (
      <div>
        <BackLink />
        <EmptyState bordered title="프로그램을 찾을 수 없어요" description="공고가 내려갔거나 주소가 바뀌었을 수 있어요." />
      </div>
    )
  }
  if (state.kind === "error") {
    return (
      <div>
        <BackLink />
        <EmptyState kind="error" bordered title="프로그램을 불러오지 못했어요" description={state.message} onRetry={() => { setState({ kind: "loading" }); load() }} />
      </div>
    )
  }

  const program = state.program
  const isAccepted = program.application_status === "accepted"
  const closed = isSubmitClosed(program, today)
  const canEdit =
    isAccepted &&
    !closed &&
    (program.submission_id === null || program.submission_status === "submitted" || program.submission_status === "resubmit_requested")
  const submitLabel =
    program.submission_status === "resubmit_requested" ? "다시 제출하기" : program.submission_id ? "고친 내용 제출하기" : "자료 제출하기"
  const noticeAttachments = Array.isArray(program.attachments) ? program.attachments : []

  const apply = async (): Promise<void | { error: string }> => {
    try {
      const res = await fetch("/api/portal/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ program_id: program.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) return { error: friendlyError(res.status, data.error, "신청하지 못했어요.") }
      toastSuccess("신청했어요")
      await load(true)
      router.refresh()
    } catch {
      return { error: friendlyError(0, null, "신청하지 못했어요.") }
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubError("")
    setSubOk("")
    if (
      !fe.check({
        files: uploading ? "파일을 올리는 중이에요. 다 올라간 뒤 다시 눌러 주세요." : subFiles.length === 0 && "파일을 1개 이상 올려 주세요",
      })
    )
      return
    setSubmitting(true)
    try {
      const isUpdate = program.submission_id !== null
      const res = await fetch("/api/portal/submissions", {
        method: isUpdate ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          isUpdate
            ? { id: program.submission_id, title: subTitle, note: subNote, attachments: subFiles }
            : { program_id: program.id, title: subTitle, note: subNote, attachments: subFiles },
        ),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        const deadlineText = program.submit_deadline ? ` 마감(${monthDay(program.submit_deadline, today)}) 전까지는 고칠 수 있어요.` : ""
        setSubOk(`${dateTime(new Date(), today)}에 제출했어요 · 파일 ${subFiles.length}개. 검토 결과는 이 화면에 보여요.${deadlineText}`)
        toastSuccess("자료를 제출했어요")
        await load(true)
        router.refresh()
      } else {
        setSubError(friendlyError(res.status, data.error, "제출하지 못했어요."))
      }
    } catch {
      setSubError(friendlyError(0, null, "제출하지 못했어요."))
    } finally {
      setSubmitting(false)
    }
  }

  const meta = [
    program.category,
    `신청 ${dateRange(program.apply_start, program.apply_end, today)}`,
    program.submit_deadline ? `제출 마감 ${monthDay(program.submit_deadline, today)}` : null,
  ].filter(Boolean) as string[]

  return (
    <div className="space-y-4">
      <div>
        <BackLink />
        <PageHeader title={program.title} help={PORTAL_PROGRAMS_HELP} helpContact={`창업보육센터 ${phone}`} className="mb-0">
          <p className="mt-1.5 flex flex-wrap gap-x-2 text-[15px] text-text-secondary">
            {meta.map((m, i) => (
              <span key={m} className="whitespace-nowrap">
                {m}
                {i < meta.length - 1 && <span aria-hidden className="ml-2">·</span>}
              </span>
            ))}
          </p>
        </PageHeader>
      </div>

      <ProgramStage program={program} mailEnabled={mailEnabled} onApply={() => setApplyOpen(true)} today={today} />

      <ConfirmDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        title={`‘${program.title}’에 신청할까요?`}
        body={
          <>
            {program.submit_deadline ? `선정되면 ${monthDay(program.submit_deadline, today)}까지 자료를 내야 해요. ` : ""}
            신청은 포털에서 취소할 수 없어요. 취소하려면 센터({phone})에 연락해 주세요.
          </>
        }
        confirmLabel="신청하기"
        busyLabel="신청하는 중…"
        failedTitle="신청하지 못했어요"
        onConfirm={apply}
      />

      <section aria-labelledby="notice-title" className="overflow-hidden rounded-md border border-warm-tan bg-card">
        <h2 id="notice-title" className="border-b border-warm-tan px-4 py-3 text-lg font-semibold text-dark sm:px-5">
          공고 내용
        </h2>
        <div className="px-4 py-4 sm:px-5">
          {program.description ? (
            <p className="text-base leading-relaxed whitespace-pre-line text-dark [word-break:keep-all]">{program.description}</p>
          ) : (
            <p className="text-base text-text-secondary">공고 내용이 없어요.</p>
          )}
          {noticeAttachments.length > 0 && (
            <div className="mt-4 border-t border-warm-tan pt-4">
              <AttachmentList attachments={noticeAttachments} touch />
            </div>
          )}
        </div>
      </section>

      {isAccepted && (
        <section id="submit" aria-labelledby="submit-title" className="scroll-mt-20 overflow-hidden rounded-md border border-warm-tan bg-card">
          <h2 id="submit-title" className="border-b border-warm-tan px-4 py-3 text-lg font-semibold text-dark sm:px-5">
            자료 제출
          </h2>
          <div className="space-y-4 px-4 py-4 sm:px-5">
            {subOk && (
              <Notice tone="success" onClose={() => setSubOk("")}>
                {subOk}
              </Notice>
            )}
            {canEdit ? (
              <form onSubmit={submit} noValidate className="space-y-5">
                <div className="rounded-md border border-warm-tan bg-warm-ivory px-4 py-3">
                  <p className="text-base font-semibold text-dark">준비할 것</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[15px] text-dark [word-break:keep-all]">
                    {noticeAttachments.length > 0 && (
                      <li>
                        공고 첨부 양식:{" "}
                        {noticeAttachments.map((a, i) => (
                          <span key={a.pathname}>
                            {i > 0 && ", "}
                            <a
                              href={`/api/file?pathname=${encodeURIComponent(a.pathname)}&download=1&name=${encodeURIComponent(a.name)}`}
                              className="text-link underline underline-offset-2 hover:text-dark"
                            >
                              {a.name}
                            </a>
                          </span>
                        ))}
                      </li>
                    )}
                    <li>받는 형식: PDF·한글·워드·엑셀·PPT·이미지·압축 파일</li>
                    <li>크기: 파일당 {PORTAL_UPLOAD_MAX_LABEL}까지</li>
                    {program.submit_deadline && <li>마감: {submitDueText(program.submit_deadline, today)}</li>}
                  </ul>
                </div>

                <ErrorSummary errors={fe.summary} />
                {subError && (
                  <Notice tone="danger" title="제출하지 못했어요">
                    {subError}
                  </Notice>
                )}

                <PortalFileUpload
                  id={fe.fieldId("files")}
                  value={subFiles}
                  onChange={(files) => {
                    setSubFiles(files)
                    if (files.length > 0) fe.clear("files")
                  }}
                  error={fe.errors.files}
                  errorId={fe.errorId("files")}
                  onUploadingChange={setUploading}
                  contactPhone={phone}
                  disabled={submitting}
                />

                <div className="space-y-1.5">
                  <Label htmlFor="s-title" className="text-base font-medium text-dark">
                    자료 이름 (선택)
                  </Label>
                  <Input id="s-title" value={subTitle} onChange={(e) => setSubTitle(e.target.value)} placeholder="예: IR 발표자료 최종본" className="h-11 text-base" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-note" className="text-base font-medium text-dark">
                    담당자에게 남길 말 (선택)
                  </Label>
                  <Textarea id="s-note" rows={3} value={subNote} onChange={(e) => setSubNote(e.target.value)} className="text-base" />
                </div>

                <BusyButton type="submit" busy={submitting} busyLabel="제출하는 중…" className="h-11 w-full text-base sm:w-auto">
                  {submitLabel}
                </BusyButton>
              </form>
            ) : program.submission_id ? (
              <div className="space-y-2">
                <p className="text-base font-medium text-dark">{program.submission_title || "(자료 이름 없음)"}</p>
                {program.submission_note && <p className="text-base whitespace-pre-line text-text-secondary">{program.submission_note}</p>}
                {Array.isArray(program.submission_attachments) && program.submission_attachments.length > 0 && (
                  <AttachmentList attachments={program.submission_attachments} touch />
                )}
                {program.submitted_at && (
                  <p className="text-sm text-text-secondary">
                    처음 제출 {dateTime(program.submitted_at, today)}
                    {program.submission_updated_at && program.submission_updated_at !== program.submitted_at
                      ? ` · 마지막 수정 ${dateTime(program.submission_updated_at, today)}`
                      : ""}
                  </p>
                )}
                <p className="text-[15px] text-text-secondary [word-break:keep-all]">
                  {closed
                    ? "제출 마감일이 지나 고칠 수 없어요. 꼭 고쳐야 하면 센터에 연락해 주세요."
                    : "검토가 시작돼 고칠 수 없어요. 꼭 고쳐야 하면 센터에 연락해 주세요."}
                </p>
              </div>
            ) : (
              <p className="text-base text-text-secondary [word-break:keep-all]">제출 마감일이 지나 제출할 수 없어요. 꼭 내야 하면 센터에 연락해 주세요.</p>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
