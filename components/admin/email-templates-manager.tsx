"use client"

// 메일 템플릿(계획서 4.1.6). 목록은 이름 먼저 + "언제 나가나요", 코드는 작은 회색 글자.
// 편집은 넓은 시트: 왼쪽 제목·본문, 오른쪽 예시값을 채운 미리보기(iframe srcDoc, 스크립트 금지 sandbox="").
// 변수 칩을 누르면 커서 위치에 넣는다. 저장 API는 기존 PUT /api/admin/email-templates 그대로.

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BusyButton, DetailSheet, EmptyState, Notice, TableSkeleton, toastSuccess, useDelayedFlag } from "@/components/saas"
import { dateShort, dateTime } from "@/lib/format"
import { friendlyError, MSG } from "@/lib/messages"
import { MAIL_TYPES } from "@/lib/email-model"

interface EmailTemplate {
  id: number
  code: string
  name: string
  subject: string
  body_html: string
  updated_at: string
}

// 템플릿별 쓸 수 있는 변수(메일을 보내는 라우트의 vars와 같다)
const TEMPLATE_VARS: Record<string, string[]> = {
  tenant_welcome: ["tenant_name", "email", "temp_password", "portal_url"],
  bill_issued: ["tenant_name", "bill_month", "amount", "due_date", "portal_url", "lines_html"],
  bill_reminder: ["tenant_name", "bill_month", "amount", "due_date", "portal_url"],
  program_notice: ["tenant_name", "program_name", "program_period", "apply_due", "portal_url"],
  application_result: ["tenant_name", "program_name", "result", "note", "portal_url"],
  submission_reminder: ["tenant_name", "submission_name", "due_date", "portal_url"],
  submission_feedback: ["tenant_name", "submission_name", "feedback", "portal_url"],
  inquiry_received: ["name", "email", "phone", "company", "message", "received_at"],
}

const VAR_LABEL: Record<string, string> = {
  tenant_name: "기업명",
  email: "로그인 이메일",
  temp_password: "임시 비밀번호",
  portal_url: "포털 주소",
  bill_month: "청구월",
  amount: "청구 금액",
  due_date: "납부 기한",
  lines_html: "청구 내역 표",
  program_name: "프로그램 이름",
  program_period: "프로그램 기간",
  apply_due: "신청 마감",
  result: "선정 결과",
  note: "안내 문구",
  submission_name: "제출물 이름",
  feedback: "검토 의견",
  name: "문의한 사람",
  phone: "전화번호",
  company: "회사명",
  message: "문의 내용",
  received_at: "접수 시각",
}

// 미리보기 예시값(가상 데이터)
const SAMPLE: Record<string, string> = {
  tenant_name: "(주)솔바람테크",
  email: "manager@example.com",
  temp_password: "••••••••",
  portal_url: "https://example.com/portal/login",
  bill_month: "2026-10",
  amount: "1,034,000원",
  due_date: "2026-10-31",
  lines_html:
    '<table style="border-collapse:collapse;width:100%;font-size:14px"><tr><td style="padding:4px 0">임대료</td><td style="text-align:right">176,400원</td></tr><tr><td style="padding:4px 0">관리비</td><td style="text-align:right">126,000원</td></tr><tr><td style="padding:4px 0">전기료</td><td style="text-align:right">111,342원</td></tr></table>',
  program_name: "2026 창업 역량 강화 교육",
  program_period: "2026-11-01 ~ 2026-11-30",
  apply_due: "2026-10-20",
  result: "선정",
  note: "첫 모임은 11월 3일이에요.",
  submission_name: "사업계획서",
  feedback: "3쪽 매출 계획을 조금 더 자세히 적어 주세요.",
  name: "홍길동",
  phone: "010-0000-0000",
  company: "(주)예시",
  message: "입주 상담을 받고 싶어요.",
  received_at: "2026-10-01 14:20",
}

function fill(text: string): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k: string) => SAMPLE[k] ?? m)
}

export function EmailTemplatesManager() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [state, setState] = useState<"loading" | "error" | "ready">("loading")
  const [loadError, setLoadError] = useState("")
  const showSkeleton = useDelayedFlag(state === "loading")

  const [editing, setEditing] = useState<EmailTemplate | null>(null)
  const [subject, setSubject] = useState("")
  const [bodyHtml, setBodyHtml] = useState("")
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<{ subject?: string; body?: string }>({})
  const lastFocus = useRef<"subject" | "body">("body")
  const subjectRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const fetchTemplates = async () => {
    setState("loading")
    try {
      const res = await fetch("/api/admin/email-templates", { credentials: "include" })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setTemplates(data.templates)
        setState("ready")
      } else {
        setLoadError(friendlyError(res.status, data.error, MSG.loadFailed))
        setState("error")
      }
    } catch {
      setLoadError(friendlyError(0, null, MSG.loadFailed))
      setState("error")
    }
  }

  useEffect(() => {
    void fetchTemplates()
  }, [])

  const openEdit = (t: EmailTemplate) => {
    setEditing(t)
    setSubject(t.subject)
    setBodyHtml(t.body_html)
    setEditError("")
    setFieldErrors({})
  }

  const dirty = !!editing && (subject !== editing.subject || bodyHtml !== editing.body_html)

  const insertVar = (v: string) => {
    const token = `{{${v}}}`
    const target = lastFocus.current
    const el = target === "subject" ? subjectRef.current : bodyRef.current
    const value = target === "subject" ? subject : bodyHtml
    const set = target === "subject" ? setSubject : setBodyHtml
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    set(value.slice(0, start) + token + value.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const handleSave = async () => {
    if (!editing) return
    const fe: typeof fieldErrors = {}
    if (!subject.trim()) fe.subject = "제목을 입력해 주세요"
    if (!bodyHtml.trim()) fe.body = "본문을 입력해 주세요"
    setFieldErrors(fe)
    if (fe.subject) return subjectRef.current?.focus()
    if (fe.body) return bodyRef.current?.focus()
    setSaving(true)
    setEditError("")
    try {
      const res = await fetch("/api/admin/email-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: editing.code, subject, body_html: bodyHtml }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        toastSuccess(`‘${editing.name}’ 템플릿을 저장했어요`)
        setEditing(null)
        void fetchTemplates()
      } else {
        setEditError(friendlyError(res.status, data.error, MSG.saveFailed))
      }
    } catch {
      setEditError(friendlyError(0, null, MSG.saveFailed))
    } finally {
      setSaving(false)
    }
  }

  const vars = editing ? (TEMPLATE_VARS[editing.code] ?? []) : []

  return (
    <div>
      {state === "loading" ? (
        showSkeleton ? <TableSkeleton rows={8} columns={3} label="템플릿을 불러오는 중…" /> : <div className="min-h-40" aria-hidden />
      ) : state === "error" ? (
        <EmptyState kind="error" bordered title="메일 템플릿을 불러오지 못했어요" description={loadError} onRetry={() => void fetchTemplates()} />
      ) : templates.length === 0 ? (
        <EmptyState bordered title="아직 메일 템플릿이 없어요" description="기본 템플릿이 아직 설치되지 않았어요." />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-md border border-warm-tan bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-warm-beige/60 hover:bg-warm-beige/60">
                  <TableHead>템플릿</TableHead>
                  <TableHead>언제 나가나요</TableHead>
                  <TableHead>제목</TableHead>
                  <TableHead className="w-28">고친 날</TableHead>
                  <TableHead className="w-24">
                    <span className="sr-only">동작</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => (
                  <TableRow key={t.code} className="text-[15px]">
                    <TableCell className="align-top">
                      <span className="block font-medium text-dark">{MAIL_TYPES[t.code]?.label ?? t.name}</span>
                      <span className="block font-mono text-xs text-text-secondary">{t.code}</span>
                    </TableCell>
                    <TableCell className="align-top text-[#3f3f4e] [word-break:keep-all]">{MAIL_TYPES[t.code]?.when ?? "-"}</TableCell>
                    <TableCell className="max-w-72 align-top">
                      <span className="block truncate" title={t.subject}>
                        {t.subject}
                      </span>
                    </TableCell>
                    <TableCell className="align-top text-text-secondary" title={dateTime(t.updated_at)}>
                      {dateShort(t.updated_at)}
                    </TableCell>
                    <TableCell className="text-right align-top">
                      <Button variant="outline" size="sm" onClick={() => openEdit(t)} aria-label={`${MAIL_TYPES[t.code]?.label ?? t.name} 템플릿 고치기`} className="hover:bg-warm-beige hover:text-dark">
                        고치기
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="divide-y divide-warm-tan/70 overflow-hidden rounded-md border border-warm-tan bg-card md:hidden">
            {templates.map((t) => (
              <li key={t.code}>
                <button type="button" onClick={() => openEdit(t)} className="block w-full px-4 py-3 text-left">
                  <span className="block text-base font-medium text-dark">{MAIL_TYPES[t.code]?.label ?? t.name}</span>
                  <span className="block text-sm text-[#3f3f4e] [word-break:keep-all]">{MAIL_TYPES[t.code]?.when ?? ""}</span>
                  <span className="mt-0.5 block truncate text-[15px] text-dark">{t.subject}</span>
                  <span className="block font-mono text-xs text-text-secondary">{t.code}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <DetailSheet
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing ? `${MAIL_TYPES[editing.code]?.label ?? editing.name} 템플릿` : "템플릿"}
        description={editing ? (MAIL_TYPES[editing.code]?.when ? `${MAIL_TYPES[editing.code].when} 나가요` : editing.code) : undefined}
        dirty={dirty}
        size="xl"
        footer={
          <BusyButton busy={saving} onClick={handleSave}>
            템플릿 저장하기
          </BusyButton>
        }
      >
        {editing && (
          <div className="grid gap-5 px-5 py-5 lg:grid-cols-2">
            <div className="grid content-start gap-4">
              {editError && <Notice tone="danger">{editError}</Notice>}
              {vars.length > 0 && (
                <div className="grid gap-1.5">
                  <p className="text-sm font-medium text-dark">변수 넣기 <span className="font-normal text-text-secondary">· 누르면 커서 자리에 들어가요</span></p>
                  <div className="flex flex-wrap gap-1.5">
                    {vars.map((v) => (
                      <Button key={v} type="button" variant="outline" size="sm" onClick={() => insertVar(v)} className="h-8 hover:bg-warm-beige hover:text-dark" title={`{{${v}}}`}>
                        {VAR_LABEL[v] ?? v}
                      </Button>
                    ))}
                  </div>
                  {vars.includes("lines_html") && (
                    <p className="text-sm text-text-secondary">‘청구 내역 표’는 임대료·관리비·전기료 줄이 표로 들어가요</p>
                  )}
                </div>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="tpl-subject">제목</Label>
                <Input
                  ref={subjectRef}
                  id="tpl-subject"
                  value={subject}
                  onFocus={() => (lastFocus.current = "subject")}
                  onChange={(e) => setSubject(e.target.value)}
                  aria-invalid={fieldErrors.subject ? true : undefined}
                  aria-describedby={fieldErrors.subject ? "tpl-subject-error" : undefined}
                  className="bg-card text-base"
                />
                {fieldErrors.subject && (
                  <p id="tpl-subject-error" className="text-sm text-red-800">
                    {fieldErrors.subject}
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tpl-body">본문(HTML)</Label>
                <Textarea
                  ref={bodyRef}
                  id="tpl-body"
                  rows={18}
                  className="bg-card font-mono text-sm"
                  value={bodyHtml}
                  onFocus={() => (lastFocus.current = "body")}
                  onChange={(e) => setBodyHtml(e.target.value)}
                  aria-invalid={fieldErrors.body ? true : undefined}
                  aria-describedby={fieldErrors.body ? "tpl-body-error" : undefined}
                />
                {fieldErrors.body && (
                  <p id="tpl-body-error" className="text-sm text-red-800">
                    {fieldErrors.body}
                  </p>
                )}
              </div>
            </div>
            <div className="grid content-start gap-1.5">
              <p className="text-sm font-medium text-dark">
                미리보기 <span className="font-normal text-text-secondary">· 예시값을 채워 보여 줘요</span>
              </p>
              <p className="rounded-t-md border border-b-0 border-warm-tan bg-warm-ivory px-3 py-2 text-[15px] text-dark">
                <span className="text-text-secondary">제목 </span>
                {fill(subject)}
              </p>
              <iframe
                title="템플릿 미리보기"
                sandbox=""
                srcDoc={`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff">${fill(bodyHtml)}</body>`}
                className="h-[28rem] w-full rounded-b-md border border-warm-tan bg-white"
              />
            </div>
          </div>
        )}
      </DetailSheet>
    </div>
  )
}
