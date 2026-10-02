"use client"

// 새 메일 시트(계획서 4.1.6) — ① 받는 곳(검색 콤보박스 + 빠른 선택) ② 내용(일반 글 기본, HTML은 고급 토글)
// ③ 미리보기(첫 기업 기준) → 확인창 "3곳에 메일을 보낼까요?" → 결과 카드(보냄·보내지 못함·건너뜀).
// 메일 발송이 꺼져 있으면 [보내기]를 끄고 같은 안내를 쓴다. 보내는 API는 기존 POST /api/admin/emails 그대로.

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  BusyButton,
  DetailSheet,
  EmptyState,
  ErrorSummary,
  Notice,
  ResultCard,
  SearchCombobox,
  useConfirm,
  type FieldErrorItem,
} from "@/components/saas"
import { friendlyError, MSG } from "@/lib/messages"
import { emailsHref } from "@/lib/links"
import { plainTextToHtml } from "@/lib/email-model"

interface TenantOption {
  id: number
  name: string
  account_email: string | null
  contact_email: string | null
  unpaid_count?: number
}

type SendResult = { sent: number; failed: number; skipped: string[] }

/** 고른 곳이 이보다 많으면 칩 목록을 접는다 */
const CHIP_FOLD_AT = 6

const emailOf = (t: TenantOption) => t.account_email || t.contact_email || null

export function ComposeSheet({
  open,
  onOpenChange,
  mailEnabled,
  onSent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mailEnabled: boolean
  onSent: () => void
}) {
  const router = useRouter()
  const ask = useConfirm()
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">("loading")
  const [selected, setSelected] = useState<number[]>([])
  const [chipsOpen, setChipsOpen] = useState(false)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [htmlMode, setHtmlMode] = useState(false)
  const [html, setHtml] = useState("")
  const [errors, setErrors] = useState<Partial<Record<"to" | "subject" | "body", string>>>({})
  const [serverError, setServerError] = useState("")
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const loadTenants = async () => {
    setLoadState("loading")
    try {
      const res = await fetch("/api/admin/tenants?status=active", { credentials: "include" })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.success) {
        setTenants(d.tenants)
        setLoadState("ready")
      } else setLoadState("error")
    } catch {
      setLoadState("error")
    }
  }

  useEffect(() => {
    if (!open) return
    setSelected([])
    setSubject("")
    setBody("")
    setHtml("")
    setHtmlMode(false)
    setErrors({})
    setServerError("")
    setResult(null)
    void loadTenants()
  }, [open])

  const withEmail = useMemo(() => tenants.filter((t) => emailOf(t)), [tenants])
  const hasUnpaidInfo = tenants.some((t) => typeof t.unpaid_count === "number")
  const unpaid = useMemo(() => withEmail.filter((t) => (t.unpaid_count ?? 0) > 0), [withEmail])
  const byId = useMemo(() => new Map(tenants.map((t) => [t.id, t])), [tenants])
  const chosen = selected.map((id) => byId.get(id)).filter((t): t is TenantOption => !!t)

  const items = tenants.map((t) => {
    const email = emailOf(t)
    return {
      value: String(t.id),
      label: t.name,
      hint: email ?? "이메일 없음",
      disabled: !email || selected.includes(t.id),
    }
  })

  const finalHtml = htmlMode ? html : plainTextToHtml(body)
  const dirty = !result && (selected.length > 0 || subject.trim() !== "" || body.trim() !== "" || html.trim() !== "")

  const toggleHtml = (on: boolean) => {
    if (on && !html.trim()) setHtml(plainTextToHtml(body))
    setHtmlMode(on)
  }

  const insertName = () => {
    const token = "{{tenant_name}}"
    const el = bodyRef.current
    const setter = htmlMode ? setHtml : setBody
    const value = htmlMode ? html : body
    if (!el) return setter(value + token)
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    setter(value.slice(0, start) + token + value.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const errorItems: FieldErrorItem[] = (
    [
      ["to", "받는 곳"],
      ["subject", "제목"],
      ["body", "본문"],
    ] as const
  )
    .filter(([k]) => errors[k])
    .map(([k, label]) => ({ field: k, label, message: errors[k]! }))

  const send = async () => {
    const e: typeof errors = {}
    if (chosen.length === 0) e.to = "받는 곳을 한 곳 이상 골라 주세요"
    if (!subject.trim()) e.subject = "제목을 입력해 주세요"
    if (!finalHtml.trim()) e.body = "본문을 입력해 주세요"
    setErrors(e)
    if (Object.keys(e).length > 0) {
      const first = e.to ? "f-to" : e.subject ? "f-subject" : "f-body"
      document.getElementById(first)?.focus()
      return
    }
    setServerError("")
    const n = chosen.length
    const names = chosen.slice(0, 3).map((t) => t.name).join(", ") + (n > 3 ? ` 외 ${n - 3}곳` : "")
    if (
      !(await ask({
        title: `${n}곳에 메일을 보낼까요?`,
        summary: [
          { label: "받는 곳", value: names },
          { label: "제목", value: subject },
        ],
        consequences: ["보낸 메일은 되돌릴 수 없어요"],
        confirmLabel: `${n}곳에 보내기`,
      }))
    )
      return
    setSending(true)
    try {
      const res = await fetch("/api/admin/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tenant_ids: selected, subject, body_html: finalHtml }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.success) {
        setResult({ sent: d.sent ?? 0, failed: d.failed ?? 0, skipped: d.skipped ?? [] })
        onSent()
        router.refresh()
      } else {
        setServerError(friendlyError(res.status, d.error, "메일을 보내지 못했어요."))
      }
    } catch {
      setServerError(friendlyError(0, null, "메일을 보내지 못했어요."))
    } finally {
      setSending(false)
    }
  }

  const closeWithCheck = async () => {
    if (
      dirty &&
      !(await ask({
        title: "쓰던 메일이 있어요. 닫을까요?",
        body: "닫으면 쓴 내용이 사라져요.",
        confirmLabel: "저장하지 않고 닫기",
        cancelLabel: "계속 쓰기",
        tone: "danger",
      }))
    )
      return
    onOpenChange(false)
  }

  const first = chosen[0]
  const previewHtml = finalHtml.replace(/\{\{\s*tenant_name\s*\}\}/g, first?.name ?? "(기업명)").replace(/\{\{\s*portal_url\s*\}\}/g, "https://…/portal/login")

  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title="새 메일"
      description="입주 중인 기업에 직접 쓴 메일을 보내요"
      dirty={dirty}
      size="lg"
      footer={
        result ? (
          <Button onClick={() => onOpenChange(false)}>닫기</Button>
        ) : (
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            {!mailEnabled && <span className="mr-auto text-sm text-text-secondary">메일 발송이 꺼져 있어 보낼 수 없어요</span>}
            <Button variant="outline" onClick={() => void closeWithCheck()} disabled={sending} className="hover:bg-warm-beige hover:text-dark">
              닫기
            </Button>
            <BusyButton busy={sending} busyLabel="보내는 중…" onClick={send} disabled={!mailEnabled}>
              {chosen.length > 0 ? `${chosen.length}곳에 보내기` : "보내기"}
            </BusyButton>
          </div>
        )
      }
    >
      <div className="grid gap-6 px-5 py-5">
        {!mailEnabled && (
          <Notice tone="info" title="메일 발송이 설정되지 않았어요">
            지금은 메일을 보낼 수 없어요. 내용을 미리 써 볼 수는 있어요.
          </Notice>
        )}

        {result ? (
          <ResultCard
            title="메일 보내기를 마쳤어요"
            tone={result.failed > 0 ? "warning" : "success"}
            rows={[
              { label: "보냄", value: `${result.sent}곳`, emphasis: true },
              { label: "보내지 못함", value: `${result.failed}곳` },
              { label: "이메일이 없어 건너뜀", value: `${result.skipped.length}곳` },
            ]}
            notes={result.skipped.length > 0 ? [`이메일이 없는 곳: ${result.skipped.join(", ")}`] : undefined}
            nextSteps={result.failed > 0 ? [{ label: "보내지 못한 메일 보기", href: emailsHref({ status: "failed" }) }] : undefined}
          />
        ) : (
          <>
            {serverError && <Notice tone="danger">{serverError}</Notice>}
            <ErrorSummary errors={errorItems} />

            {/* ① 받는 곳 */}
            <section className="grid gap-2" aria-labelledby="compose-to-title">
              <h3 id="compose-to-title" className="text-base font-semibold text-dark">
                받는 곳 {chosen.length > 0 && <span className="font-normal text-text-secondary">· {chosen.length}곳</span>}
              </h3>
              {loadState === "error" ? (
                <EmptyState kind="error" compact bordered title="입주기업 목록을 불러오지 못했어요" description={MSG.network} onRetry={loadTenants} />
              ) : (
                <>
                  <Label htmlFor="f-to" className="sr-only">
                    받는 기업 찾기
                  </Label>
                  <SearchCombobox
                    id="f-to"
                    items={items}
                    value={null}
                    onSelect={(v) => {
                      setSelected((s) => (s.includes(Number(v)) ? s : [...s, Number(v)]))
                      setErrors((e) => ({ ...e, to: undefined }))
                    }}
                    placeholder={loadState === "loading" ? "입주기업을 불러오는 중…" : "기업 이름으로 찾기"}
                    emptyText="맞는 기업이 없어요"
                    disabled={loadState !== "ready"}
                    invalid={!!errors.to}
                    aria-describedby={errors.to ? "compose-to-error" : undefined}
                  />
                  {errors.to && (
                    <p id="compose-to-error" className="text-sm text-red-800">
                      {errors.to}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={loadState !== "ready" || withEmail.length === 0}
                      onClick={() => setSelected(withEmail.map((t) => t.id))}
                      className="hover:bg-warm-beige hover:text-dark"
                    >
                      입주 중 전체 {withEmail.length}곳
                    </Button>
                    {hasUnpaidInfo && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={unpaid.length === 0}
                        onClick={() => setSelected(unpaid.map((t) => t.id))}
                        className="hover:bg-warm-beige hover:text-dark"
                      >
                        받을 돈 있는 곳 {unpaid.length}곳
                      </Button>
                    )}
                    {selected.length > 0 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([])} className="hover:bg-warm-beige hover:text-dark">
                        모두 빼기
                      </Button>
                    )}
                  </div>
                  {tenants.length > withEmail.length && (
                    <p className="text-sm text-text-secondary">이메일이 없는 {tenants.length - withEmail.length}곳은 고를 수 없어요</p>
                  )}
                  {/* 많이 고르면(휴대폰에서 본문·미리보기가 화면 아래로 밀리지 않게) "n곳 고름 · 펼쳐 보기"로 접는다 */}
                  {chosen.length > CHIP_FOLD_AT && (
                    <p className="flex flex-wrap items-center gap-x-2 text-[15px] text-dark">
                      <span>
                        {chosen.length}곳 고름{chipsOpen ? "" : ` · ${chosen.slice(0, 2).map((t) => t.name).join(", ")} 외 ${chosen.length - 2}곳`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setChipsOpen((v) => !v)}
                        aria-expanded={chipsOpen}
                        className="inline-flex min-h-8 items-center text-link underline underline-offset-2 hover:text-dark"
                      >
                        {chipsOpen ? "접기" : "펼쳐 보기"}
                      </button>
                    </p>
                  )}
                  {chosen.length > 0 && (chosen.length <= CHIP_FOLD_AT || chipsOpen) && (
                    <ul className="flex flex-wrap gap-1.5" aria-label="고른 받는 곳">
                      {chosen.map((t) => (
                        <li key={t.id} className="inline-flex h-8 items-center gap-1 rounded-sm border border-warm-tan bg-warm-ivory pl-2 text-[15px] text-dark">
                          {t.name}
                          <button
                            type="button"
                            onClick={() => setSelected((s) => s.filter((x) => x !== t.id))}
                            aria-label={`${t.name} 빼기`}
                            className="inline-flex size-8 items-center justify-center rounded-sm text-[#3f3f4e] hover:bg-warm-beige"
                          >
                            <X className="size-4" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>

            {/* ② 내용 */}
            <section className="grid gap-3" aria-labelledby="compose-body-title">
              <h3 id="compose-body-title" className="text-base font-semibold text-dark">
                내용
              </h3>
              <div className="grid gap-1.5">
                <Label htmlFor="f-subject">제목</Label>
                <Input
                  id="f-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  aria-invalid={errors.subject ? true : undefined}
                  aria-describedby={errors.subject ? "compose-subject-error" : undefined}
                  className="bg-card text-base"
                />
                {errors.subject && (
                  <p id="compose-subject-error" className="text-sm text-red-800">
                    {errors.subject}
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="f-body">{htmlMode ? "본문(HTML)" : "본문"}</Label>
                  <Button type="button" variant="outline" size="sm" onClick={insertName} className="hover:bg-warm-beige hover:text-dark">
                    기업명 넣기
                  </Button>
                </div>
                <Textarea
                  ref={bodyRef}
                  id="f-body"
                  rows={8}
                  value={htmlMode ? html : body}
                  onChange={(e) => (htmlMode ? setHtml(e.target.value) : setBody(e.target.value))}
                  aria-invalid={errors.body ? true : undefined}
                  aria-describedby={errors.body ? "compose-body-error compose-body-hint" : "compose-body-hint"}
                  className={`bg-card text-base ${htmlMode ? "font-mono text-sm" : ""}`}
                />
                <p id="compose-body-hint" className="text-sm text-text-secondary">
                  {htmlMode
                    ? "HTML 태그를 그대로 보내요. {{tenant_name}}은 기업명으로 바뀌어요"
                    : "빈 줄로 단락을 나눠요. [기업명 넣기]를 누르면 받는 기업 이름이 들어가요"}
                </p>
                {errors.body && (
                  <p id="compose-body-error" className="text-sm text-red-800">
                    {errors.body}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="compose-html" checked={htmlMode} onCheckedChange={(v) => toggleHtml(v === true)} />
                <Label htmlFor="compose-html" className="font-normal">
                  HTML로 직접 편집(고급)
                </Label>
              </div>
            </section>

            {/* ③ 미리보기 */}
            <section className="grid gap-2" aria-labelledby="compose-preview-title">
              <h3 id="compose-preview-title" className="text-base font-semibold text-dark">
                미리보기 <span className="font-normal text-text-secondary">· {first ? `${first.name} 기준` : "받는 곳을 고르면 첫 기업 기준으로 보여요"}</span>
              </h3>
              {finalHtml.trim() ? (
                <iframe
                  title="메일 미리보기"
                  sandbox=""
                  srcDoc={`<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#222;margin:12px">${previewHtml}</body>`}
                  className="h-56 w-full rounded-md border border-warm-tan bg-white"
                />
              ) : (
                <p className="rounded-md border border-dashed border-warm-tan px-4 py-6 text-center text-sm text-text-secondary">본문을 쓰면 여기에 보여요</p>
              )}
            </section>
          </>
        )}
      </div>
    </DetailSheet>
  )
}
