"use client"

// 메일 기록 화면(계획서 4.1.6). 서버 page가 isMailEnabled()를 prop으로 넘긴다.
//   - 메일 꺼짐: 맨 위 안내, "설정 안 됨" 실패는 "보내지 못함"에서 빼고 "기록만 남음"으로 따로, 그 행에는 [다시 보내기] 없음
//   - 켜짐: 실패가 있으면 "보내지 못함" 탭이 기본
//   - 종류는 한글(template_code 매핑), 오류는 쉬운 말, 행을 누르면 오른쪽 시트(받는 사람·제목·오류 전문·관련 청구서)
//   - "같은 내용으로 다시 보내기": 첨부 PDF 없이 그때 본문 그대로. 메일 뒤에 바뀐 청구서·납부 완료 청구서는 끔
//   - 주소 값: ?status=failed|sent|not_configured|all, ?type=<template_code>, ?q=, ?period=30d|90d|365d, ?log=ID(시트)
// 조회는 GET /api/admin/emails?since=…(건수 응답 포함).

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PenSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  BusyButton,
  DetailSheet,
  EmptyState,
  FilterBar,
  FilterTabs,
  Notice,
  PageHeader,
  RowActions,
  StatusBadge,
  TableSkeleton,
  toastSuccess,
  useConfirm,
  useDelayedFlag,
  useUrlState,
} from "@/components/saas"
import { billMonthShort, dateTime, relative } from "@/lib/format"
import { friendlyError, MSG } from "@/lib/messages"
import { billsHref } from "@/lib/links"
import type { HelpTopic } from "@/lib/help/types"
import {
  friendlyMailError,
  MAIL_TYPES,
  mailRowStatus,
  mailTypeLabel,
  resendAvailability,
  type MailLogRow,
} from "@/lib/email-model"
import { ComposeSheet } from "@/components/admin/emails/compose-sheet"

type Counts = { failed: number; not_configured: number; sent: number; queued: number; all: number }
type View = "failed" | "not_configured" | "sent" | "queued" | "all"

const PERIODS = [
  { value: "30d", label: "최근 30일" },
  { value: "90d", label: "최근 90일" },
  { value: "365d", label: "최근 1년" },
] as const

const EMAILS_HELP: HelpTopic = {
  title: "메일",
  steps: [
    "시스템이 보낸 메일 기록을 기간·상태·종류로 봐요",
    "행을 누르면 받는 사람·제목·오류 내용을 볼 수 있어요",
    "보내지 못한 메일은 ‘같은 내용으로 다시 보내기’로 그때 본문을 다시 보내요(첨부 PDF는 빠져요)",
    "[새 메일]로 입주기업에 직접 쓴 메일을 보내요",
  ],
  terms: ["mail", "invoice"],
}

const TYPE_OPTIONS = Object.entries(MAIL_TYPES).map(([code, v]) => ({ value: code, label: v.label }))

export function EmailsManager({ mailEnabled }: { mailEnabled: boolean }) {
  const router = useRouter()
  const ask = useConfirm()
  const [statusParam, setStatusParam] = useUrlState("status", "")
  const [type, setType] = useUrlState("type", "")
  const [q, setQ] = useUrlState("q", "")
  const [period, setPeriod] = useUrlState("period", "30d")
  const [logParam, setLogParam] = useUrlState("log", "")
  const [composeOpen, setComposeOpen] = useState(false)

  const [logs, setLogs] = useState<MailLogRow[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [state, setState] = useState<"loading" | "error" | "ready">("loading")
  const [loadError, setLoadError] = useState("")
  const [moreLoading, setMoreLoading] = useState(false)
  const [resendingId, setResendingId] = useState<number | null>(null)
  const [resendError, setResendError] = useState<{ id: number; message: string } | null>(null)
  const [searchText, setSearchText] = useState(q)
  const showSkeleton = useDelayedFlag(state === "loading")
  const reqSeq = useRef(0)
  const tabsRef = useRef<HTMLDivElement>(null)

  const validPeriod = PERIODS.some((p) => p.value === period) ? period : "30d"
  const validStatus = (["failed", "not_configured", "sent", "queued", "all"] as const).includes(statusParam as View) ? (statusParam as View) : ""
  // 기본 탭: 켜짐이면 보내지 못함(실패가 없으면 전체), 꺼짐이면 전체
  const view: View = validStatus || (mailEnabled && (counts === null || counts.failed > 0) ? "failed" : "all")

  const fetchPage = useCallback(
    async (pageNum: number) => {
      const qs = new URLSearchParams({ since: validPeriod, status: view, page: String(pageNum) })
      if (type) qs.set("type", type)
      if (q) qs.set("q", q)
      const res = await fetch(`/api/admin/emails?${qs}`, { credentials: "include" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw Object.assign(new Error("load"), { status: res.status, body: data })
      return data as { logs: MailLogRow[]; counts: Counts; has_more: boolean }
    },
    [validPeriod, view, type, q],
  )

  const load = useCallback(async () => {
    const seq = ++reqSeq.current
    setState("loading")
    try {
      const data = await fetchPage(1)
      if (seq !== reqSeq.current) return
      setLogs(data.logs)
      setCounts(data.counts)
      setHasMore(data.has_more)
      setPage(1)
      setState("ready")
    } catch (e) {
      if (seq !== reqSeq.current) return
      const err = e as { status?: number; body?: { error?: string } }
      setLoadError(friendlyError(err.status ?? 0, err.body?.error, MSG.loadFailed))
      setState("error")
    }
  }, [fetchPage])

  useEffect(() => {
    void load()
  }, [load])

  // 검색어는 잠깐 멈춘 뒤 주소에 남긴다
  useEffect(() => {
    if (searchText === q) return
    const t = setTimeout(() => setQ(searchText.trim() || null), 350)
    return () => clearTimeout(t)
  }, [searchText, q, setQ])

  const loadMore = async () => {
    setMoreLoading(true)
    try {
      const data = await fetchPage(page + 1)
      setLogs((l) => [...l, ...data.logs])
      setHasMore(data.has_more)
      setPage((p) => p + 1)
    } catch (e) {
      const err = e as { status?: number; body?: { error?: string } }
      setLoadError(friendlyError(err.status ?? 0, err.body?.error, MSG.loadFailed))
    } finally {
      setMoreLoading(false)
    }
  }

  const selectedLog = useMemo(() => logs.find((l) => String(l.id) === logParam) ?? null, [logs, logParam])

  const resend = async (log: MailLogRow) => {
    const a = resendAvailability(log, mailEnabled)
    if (!a.canResend) return
    if (
      !(await ask({
        title: `${log.tenant_name ?? log.to_email}에 같은 내용으로 다시 보낼까요?`,
        summary: [
          { label: "받는 사람", value: log.to_email },
          { label: "제목", value: log.subject ?? "-" },
        ],
        body: a.billMail
          ? "첨부 PDF 없이 그때 보낸 본문 그대로 다시 가요. PDF가 필요하면 청구서 화면에서 받아 따로 전달해 주세요."
          : "그때 보낸 제목과 본문 그대로 다시 가요.",
        confirmLabel: "다시 보내기",
      }))
    )
      return
    setResendingId(log.id)
    setResendError(null)
    try {
      const res = await fetch("/api/admin/emails/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: log.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        toastSuccess("메일을 다시 보냈어요", { description: log.to_email })
        void load()
        router.refresh()
      } else {
        const msg = res.status === 502 ? "이번에도 보내지 못했어요. 받는 주소를 확인해 주세요." : friendlyError(res.status, data.error, "다시 보내지 못했어요.")
        setResendError({ id: log.id, message: msg })
        void load()
      }
    } catch {
      setResendError({ id: log.id, message: friendlyError(0, null, "다시 보내지 못했어요.") })
    } finally {
      setResendingId(null)
    }
  }

  const tabOptions = [
    { value: "failed", label: "보내지 못함", count: counts?.failed ?? null },
    ...(counts && (counts.not_configured > 0 || !mailEnabled) ? [{ value: "not_configured", label: "기록만 남음", count: counts.not_configured }] : []),
    { value: "sent", label: "보냄", count: counts?.sent ?? null },
    { value: "all", label: "전체", count: counts?.all ?? null },
  ]

  // 휴대폰에서 기본 선택 탭(예: 메일 꺼짐이면 맨 끝 "전체")이 가로 스크롤 밖으로 잘리지 않게 보이는 자리로 옮긴다(페이지는 움직이지 않음)
  const tabCountsKey = tabOptions.map((o) => `${o.value}:${o.count ?? ""}`).join("|")
  useEffect(() => {
    const box = tabsRef.current?.querySelector<HTMLElement>(".overflow-x-auto")
    const on = box?.querySelector<HTMLElement>('[data-state="on"]')
    if (!box || !on) return
    const b = box.getBoundingClientRect()
    const e = on.getBoundingClientRect()
    if (e.right > b.right) box.scrollLeft += e.right - b.right + 4
    else if (e.left < b.left) box.scrollLeft -= b.left - e.left + 4
  }, [view, tabCountsKey])

  const filtered = Boolean(type || q)
  const periodLabel = PERIODS.find((p) => p.value === validPeriod)!.label

  const rowActions = (log: MailLogRow) => {
    const a = resendAvailability(log, mailEnabled)
    const items: { label: string; onSelect?: () => void; disabled?: boolean; disabledReason?: string }[] = [
      { label: "자세히 보기", onSelect: () => setLogParam(log.id) },
    ]
    if (log.status === "failed" && mailRowStatus(log) !== "not_configured") {
      items.push({ label: "같은 내용으로 다시 보내기", onSelect: () => void resend(log), disabled: !a.canResend || resendingId !== null, disabledReason: a.reason ?? undefined })
    }
    return <RowActions label={log.tenant_name ?? log.to_email} items={items} />
  }

  return (
    <>
      <PageHeader
        title="메일"
        description="시스템이 보낸 메일 기록을 보고, 입주기업에 새 메일을 보내요"
        help={EMAILS_HELP}
        secondary={
          <Button asChild variant="outline" className="hover:bg-warm-beige hover:text-dark">
            <Link href="/admin/emails/templates">메일 템플릿</Link>
          </Button>
        }
        primary={
          <Button onClick={() => setComposeOpen(true)}>
            <PenSquare className="size-4" aria-hidden />
            새 메일
          </Button>
        }
      />

      {!mailEnabled && (
        <Notice tone="info" title="메일 발송이 설정되지 않았어요" className="mb-4">
          지금은 보내려던 기록만 남아요. 청구서는 PDF로 직접 전달해 주세요.
        </Notice>
      )}

      <div ref={tabsRef}>
        <FilterTabs label="메일 상태" options={tabOptions} value={view} onValueChange={(v) => v && setStatusParam(v)} className="mb-3" />
      </div>

      <FilterBar
        search={{ value: searchText, onChange: setSearchText, label: "기업·받는 사람·제목 검색", placeholder: "기업·받는 사람·제목 검색" }}
        filters={
          <>
            <Select value={type || "__all"} onValueChange={(v) => setType(v === "__all" ? null : v)}>
              <SelectTrigger className="h-9 w-40 bg-card text-[15px]" aria-label="메일 종류">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">모든 종류</SelectItem>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={validPeriod} onValueChange={(v) => setPeriod(v)}>
              <SelectTrigger className="h-9 w-32 bg-card text-[15px]" aria-label="조회 기간">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        chips={[
          ...(type ? [{ label: `종류: ${mailTypeLabel(type)}`, onRemove: () => setType(null) }] : []),
          ...(q ? [{ label: `검색: ${q}`, onRemove: () => { setSearchText(""); setQ(null) } }] : []),
        ]}
        onClearAll={filtered ? () => { setType(null); setSearchText(""); setQ(null) } : undefined}
        summary={state === "ready" ? `${periodLabel} · ${logs.length}${hasMore ? "+" : ""}건` : undefined}
      />

      {resendError && !selectedLog && (
        <Notice tone="danger" className="mb-3" onClose={() => setResendError(null)}>
          {resendError.message}
        </Notice>
      )}

      {state === "loading" ? (
        showSkeleton ? <TableSkeleton rows={6} columns={5} label="메일 기록을 불러오는 중…" /> : <div className="min-h-40" aria-hidden />
      ) : state === "error" ? (
        <EmptyState kind="error" bordered title="메일 기록을 불러오지 못했어요" description={loadError} onRetry={() => void load()} />
      ) : logs.length === 0 ? (
        filtered ? (
          <EmptyState
            kind="no-results"
            bordered
            title="조건에 맞는 메일 기록이 없어요"
            onClear={() => {
              setType(null)
              setSearchText("")
              setQ(null)
            }}
          />
        ) : (
          <EmptyState
            bordered
            title={view === "failed" ? `${periodLabel} 동안 보내지 못한 메일이 없어요` : `${periodLabel} 동안 메일 기록이 없어요`}
            description="기간을 넓히거나 다른 탭을 골라 보세요"
          />
        )
      ) : (
        <>
          {/* 넓은 화면: 표 */}
          <div className="hidden overflow-hidden rounded-md border border-warm-tan bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-warm-beige/60 hover:bg-warm-beige/60">
                  <TableHead className="w-32">상태</TableHead>
                  <TableHead className="w-32">종류</TableHead>
                  <TableHead>받는 사람</TableHead>
                  <TableHead>제목</TableHead>
                  <TableHead className="w-32">보낸 시각</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">동작</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const st = mailRowStatus(log)
                  return (
                    <TableRow key={log.id} className="cursor-pointer text-[15px]" onClick={() => setLogParam(log.id)}>
                      <TableCell className="align-top">
                        <StatusBadge domain="email" status={st} showDefaultDetail={false} />
                      </TableCell>
                      <TableCell className="align-top">{mailTypeLabel(log.template_code)}</TableCell>
                      <TableCell className="max-w-56 align-top">
                        <button
                          type="button"
                          className="block max-w-full truncate text-left font-medium text-dark underline-offset-2 hover:underline"
                          onClick={(e) => {
                            e.stopPropagation()
                            setLogParam(log.id)
                          }}
                        >
                          {log.tenant_name ?? log.to_email}
                        </button>
                        {log.tenant_name && <span className="block truncate text-sm text-text-secondary">{log.to_email}</span>}
                      </TableCell>
                      <TableCell className="max-w-72 align-top">
                        <span className="block truncate" title={log.subject ?? ""}>
                          {log.subject || "-"}
                        </span>
                        {st === "failed" && <span className="block text-sm text-red-800 [word-break:keep-all]">{friendlyMailError(log.error)}</span>}
                      </TableCell>
                      <TableCell className="align-top text-text-secondary" title={dateTime(log.sent_at || log.created_at)}>
                        {relative(log.sent_at || log.created_at)}
                      </TableCell>
                      <TableCell className="align-top" onClick={(e) => e.stopPropagation()}>
                        {rowActions(log)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* 휴대폰: 카드 목록(상태 배지가 맨 앞) */}
          <ul className="divide-y divide-warm-tan/70 overflow-hidden rounded-md border border-warm-tan bg-card md:hidden">
            {logs.map((log) => {
              const st = mailRowStatus(log)
              return (
                <li key={log.id} className="flex items-start gap-1 pr-1">
                  <button type="button" onClick={() => setLogParam(log.id)} className="min-w-0 flex-1 px-4 py-3 text-left">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <StatusBadge domain="email" status={st} showDefaultDetail={false} />
                      <span className="text-sm text-[#3f3f4e]">{mailTypeLabel(log.template_code)}</span>
                      <span className="ml-auto text-sm text-text-secondary">{relative(log.sent_at || log.created_at)}</span>
                    </span>
                    <span className="mt-1 block truncate text-base font-medium text-dark">{log.tenant_name ?? log.to_email}</span>
                    <span className="block truncate text-[15px] text-[#3f3f4e]">{log.subject || "-"}</span>
                    {st === "failed" && <span className="mt-0.5 block text-sm text-red-800 [word-break:keep-all]">{friendlyMailError(log.error)}</span>}
                  </button>
                  <div className="pt-2">{rowActions(log)}</div>
                </li>
              )
            })}
          </ul>

          {hasMore && (
            <div className="mt-3 flex justify-center">
              <BusyButton variant="outline" busy={moreLoading} busyLabel={MSG.busyLoad} onClick={loadMore} className="hover:bg-warm-beige hover:text-dark">
                더 보기
              </BusyButton>
            </div>
          )}
        </>
      )}

      <LogSheet
        log={selectedLog}
        open={!!logParam && !!selectedLog}
        onOpenChange={(o) => !o && setLogParam(null)}
        mailEnabled={mailEnabled}
        resending={resendingId !== null}
        error={selectedLog && resendError?.id === selectedLog.id ? resendError.message : null}
        onResend={resend}
      />

      <ComposeSheet open={composeOpen} onOpenChange={setComposeOpen} mailEnabled={mailEnabled} onSent={() => void load()} />
    </>
  )
}

function LogSheet({
  log,
  open,
  onOpenChange,
  mailEnabled,
  resending,
  error,
  onResend,
}: {
  log: MailLogRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  mailEnabled: boolean
  resending: boolean
  error: string | null
  onResend: (log: MailLogRow) => void
}) {
  if (!log) return null
  const st = mailRowStatus(log)
  const a = resendAvailability(log, mailEnabled)
  const showResend = log.status === "failed" && st !== "not_configured"
  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={log.subject || "(제목 없음)"}
      badge={<StatusBadge domain="email" status={st} showDefaultDetail={false} />}
      size="md"
      highlights={[
        { label: "종류", value: mailTypeLabel(log.template_code) },
        { label: st === "sent" ? "보낸 시각" : "기록 시각", value: dateTime(log.sent_at || log.created_at) },
      ]}
      footer={
        showResend ? (
          <BusyButton busy={resending} busyLabel="보내는 중…" disabled={!a.canResend} onClick={() => onResend(log)}>
            같은 내용으로 다시 보내기
          </BusyButton>
        ) : undefined
      }
    >
      <div className="grid gap-4 px-5 py-5 text-base">
        {error && <Notice tone="danger">{error}</Notice>}
        <dl className="grid gap-3">
          <div>
            <dt className="text-sm text-text-secondary">받는 사람</dt>
            <dd className="break-all text-dark">
              {log.tenant_name ? `${log.tenant_name} · ` : ""}
              {log.to_email}
            </dd>
          </div>
          {log.status === "failed" && (
            <div>
              <dt className="text-sm text-text-secondary">무슨 일이 있었나요</dt>
              <dd className="text-dark [word-break:keep-all]">{friendlyMailError(log.error)}</dd>
              {log.error && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-sm text-[#3f3f4e]">오류 원문 보기</summary>
                  <p className="mt-1 break-all rounded-sm bg-warm-beige/60 px-2 py-1 font-mono text-sm text-dark">{log.error}</p>
                </details>
              )}
            </div>
          )}
          {a.billMail && log.related_id && (
            <div>
              <dt className="text-sm text-text-secondary">관련 청구서</dt>
              <dd>
                <Link href={billsHref({ bill: log.related_id })} className="text-link underline underline-offset-2 hover:text-dark">
                  청구서 열기{log.bill_period ? ` (${billMonthShort(log.bill_period.trim())})` : ""}
                </Link>
              </dd>
            </div>
          )}
        </dl>
        {showResend && (
          <p className="rounded-md bg-warm-beige/60 px-3 py-2 text-sm leading-relaxed text-[#3f3f4e] [word-break:keep-all]">
            {a.canResend
              ? a.billMail
                ? "다시 보내면 첨부 PDF 없이 그때 보낸 본문 그대로 다시 가요. PDF가 필요하면 청구서 화면에서 받아 따로 전달해 주세요."
                : "다시 보내면 그때 보낸 제목과 본문 그대로 다시 가요."
              : a.reason}
          </p>
        )}
        {st === "not_configured" && (
          <p className="rounded-md bg-warm-beige/60 px-3 py-2 text-sm text-[#3f3f4e]">메일 발송 설정이 없던 때의 기록이라 다시 보내지 않아요.</p>
        )}
      </div>
    </DetailSheet>
  )
}
