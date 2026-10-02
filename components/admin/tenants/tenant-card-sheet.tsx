"use client"

// 기업 카드(오른쪽 시트, 계획서 4.3.6) — 한 기업의 계약·청구·받을 돈·연락처·포털 계정·메모를 한곳에서 본다.
// 주소 ?tenant=ID&card=overview|contract|bills|contact|memo 로 열고 닫는다(목록·호실 시트·청구서에서 같은 카드).
// 데이터는 GET /api/admin/tenants/[id]/summary 한 번(조회 전용). [정보 수정]을 누르면 같은 시트가 편집 모드가 된다(4.3.7).
// 메모는 바로 고치고 저장한다(PUT {id, name, memo} — API가 보내지 않은 칸을 유지한다).

import { useCallback, useEffect, useRef, useState, type MouseEvent, type MutableRefObject, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  BusyButton,
  CardSkeleton,
  CopyButton,
  DetailSheet,
  EmptyState,
  Money,
  Notice,
  RowActions,
  Section,
  StatusBadge,
  ToneBadge,
  toastSuccess,
  toastInfo,
  useConfirm,
  type RowActionItem,
} from "@/components/saas"
import { billBadge } from "@/lib/status"
import { billMonthShort, date as fmtDate, dateShort, dateTime, due, num, relative, sinceIssued, won } from "@/lib/format"
import { friendlyError, MSG } from "@/lib/messages"
import { billingSettingsHref, billsHref, emailsHref, roomsHref, type TenantCardTab } from "@/lib/links"
import type { BillingBankInfo } from "@/lib/bank-info"
import { useTenantForm, firstRoomCode } from "./tenant-edit-form"
import { PortalAccountPanel, type IssuedAccount } from "./portal-account-panel"
import { billMailTarget, businessNoError, paymentNoticeText, roomsLabel, type TenantRow, type TenantSummary } from "@/lib/tenant-model"
// 메일 종류 이름·설정 안 됨 판정은 메일 화면(WP1)과 같은 규칙을 쓴다(순수 모듈)
import { isNotConfiguredError, MAIL_TYPES } from "@/lib/email-model"

export const CARD_TABS: { value: TenantCardTab; label: string }[] = [
  { value: "overview", label: "개요" },
  { value: "contract", label: "계약" },
  { value: "bills", label: "청구·납부" },
  { value: "contact", label: "연락처·포털" },
  { value: "memo", label: "메모" },
]

function mailLabel(code: string | null | undefined, subject: string | null | undefined): string {
  if (!code) return MAIL_TYPES.manual.label
  return MAIL_TYPES[code]?.label ?? subject ?? "메일"
}

/** 목록 화면이 카드에 ⋯ 동작 결과를 돌려줄 통로(오류는 카드 안 Notice로, 성공 뒤에는 카드를 다시 읽는다) */
export interface CardActionSink {
  tenantId: number
  refresh: () => void
  setError: (message: string) => void
}

const ISSUED_LEAVE_CONFIRM = {
  title: "안내문을 전달했나요?",
  body: "닫으면 임시 비밀번호를 다시 볼 수 없어요. 잊었다면 비밀번호를 다시 발급해야 해요.",
  confirmLabel: "전달했어요, 닫기",
  cancelLabel: "계속 보기",
} as const

function Dl({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-base sm:grid-cols-[9rem_1fr] sm:gap-y-2">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="pt-1 text-[#5f6070] sm:pt-0">{r.label}</dt>
          <dd className="min-w-0 break-words text-dark">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

const linkCls = "text-link underline underline-offset-2"

export function TenantCardSheet({
  tenantId,
  listRow,
  tab,
  onTabChange,
  editing,
  onEditingChange,
  onClose,
  onMissing,
  actionSink,
  onChanged,
  rowActions,
  mailEnabled,
  bank,
  contactPhone,
}: {
  tenantId: number
  /** 목록에서 이미 가진 행(요약을 불러오는 동안 제목·요약을 바로 보이게) */
  listRow: TenantRow | null
  tab: TenantCardTab
  onTabChange: (tab: TenantCardTab) => void
  editing: boolean
  onEditingChange: (editing: boolean) => void
  onClose: () => void
  /** 기업이 없을 때(404) — 오류 화면 대신 카드를 닫는다(3.4 주소 계약) */
  onMissing: () => void
  /** ⋯ 동작 결과를 카드로 돌려받는 통로(목록 화면이 갖고 있다) */
  actionSink: MutableRefObject<CardActionSink | null>
  /** 저장·발급 뒤 목록을 다시 읽게 */
  onChanged: () => void
  /** ⋯ 메뉴(상태 바꾸기·삭제) — 목록과 같은 항목 */
  rowActions: (t: TenantRow) => RowActionItem[]
  mailEnabled: boolean
  bank: BillingBankInfo
  contactPhone: string | null
}) {
  const ask = useConfirm()
  const router = useRouter()
  const [data, setData] = useState<TenantSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [issued, setIssued] = useState<IssuedAccount | null>(null)
  const [memo, setMemo] = useState("")
  const [memoSaving, setMemoSaving] = useState(false)
  const [memoError, setMemoError] = useState("")
  const [actionError, setActionError] = useState("")
  const reqId = useRef(0)
  const missingRef = useRef(onMissing)
  missingRef.current = onMissing

  const load = useCallback(
    async (silent = false) => {
      const my = ++reqId.current
      if (!silent) {
        setLoading(true)
        setError("")
      }
      try {
        const res = await fetch(`/api/admin/tenants/${tenantId}/summary`, { credentials: "include", cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        if (my !== reqId.current) return
        if (res.ok && body.success) {
          setData(body.summary as TenantSummary)
          setError("")
        } else if (res.status === 404) {
          missingRef.current()
        } else if (!silent) {
          setError(friendlyError(res.status, body.error, MSG.loadFailed))
        }
      } catch {
        if (my === reqId.current && !silent) setError(friendlyError(0, null, MSG.loadFailed))
      } finally {
        if (my === reqId.current) setLoading(false)
      }
    },
    [tenantId],
  )

  useEffect(() => {
    setData(null)
    setIssued(null)
    setActionError("")
    void load()
  }, [load])

  // ⋯ 동작(상태 바꾸기·되돌리기·삭제)의 결과를 이 카드로 받는다
  useEffect(() => {
    const sink: CardActionSink = { tenantId, refresh: () => void load(true), setError: setActionError }
    actionSink.current = sink
    return () => {
      if (actionSink.current === sink) actionSink.current = null
    }
  }, [actionSink, tenantId, load])

  // 발급 결과(임시 비밀번호)가 보이는 동안 카드 안 링크로 떠나면 확인을 받는다(닫기·Esc와 같은 확인)
  const issuedRef = useRef(issued)
  issuedRef.current = issued
  const guardLinks = (e: MouseEvent<HTMLDivElement>) => {
    if (!issuedRef.current) return
    const a = (e.target as HTMLElement).closest("a[href]")
    if (!(a instanceof HTMLAnchorElement)) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0 || a.target === "_blank") return // 새 탭은 이 화면을 그대로 둔다
    e.preventDefault()
    e.stopPropagation()
    const href = a.getAttribute("href") ?? ""
    void (async () => {
      if (!(await ask(ISSUED_LEAVE_CONFIRM))) return
      setIssued(null)
      router.push(href)
    })()
  }

  const tenant: TenantRow | null = data?.tenant ?? listRow
  const savedMemo = data?.tenant.memo ?? ""
  useEffect(() => {
    setMemo(savedMemo)
    setMemoError("")
  }, [savedMemo, tenantId])
  const memoDirty = !!data && memo.trim() !== savedMemo.trim()

  const form = useTenantForm({
    mode: "edit",
    tenant,
    mailEnabled,
    onSaved: ({ name, unchanged }) => {
      onEditingChange(false)
      if (unchanged) {
        toastInfo("바꾼 내용이 없어요")
        return
      }
      toastSuccess(`${name} 정보를 저장했어요`)
      void load(true)
      onChanged()
    },
  })
  // 편집을 시작할 때(또는 편집 중 저장된 행이 바뀌었을 때) 폼을 지금 값으로 채운다.
  // 목록 행으로 먼저 연 뒤 요약이 도착해도(같은 updated_at) 입력 중인 값을 지우지 않는다
  const tenantKey = tenant ? `${tenant.id}:${tenant.updated_at ?? ""}` : ""
  const resetRef = useRef(form.reset)
  resetRef.current = form.reset
  useEffect(() => {
    if (editing) resetRef.current()
  }, [editing, tenantKey])

  const requestClose = async () => {
    if (issued) {
      const ok = await ask(ISSUED_LEAVE_CONFIRM)
      if (!ok) return
    }
    setIssued(null)
    onEditingChange(false)
    onClose()
  }

  const leaveEdit = async () => {
    if (form.dirty) {
      const ok = await ask({
        title: "저장하지 않은 변경이 있어요. 수정을 그만둘까요?",
        body: "그만두면 고친 내용이 사라지고 기업 카드로 돌아가요.",
        confirmLabel: "저장하지 않고 그만두기",
        cancelLabel: "계속 고치기",
        tone: "danger",
      })
      if (!ok) return
    }
    onEditingChange(false)
  }

  const saveMemo = async () => {
    if (!tenant || memoSaving) return
    setMemoSaving(true)
    setMemoError("")
    try {
      const res = await fetch("/api/admin/tenants", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: tenant.id, name: tenant.name, memo }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.success) {
        toastSuccess("메모를 저장했어요")
        void load(true)
        onChanged()
      } else {
        setMemoError(friendlyError(res.status, body.error, MSG.saveFailed))
      }
    } catch {
      setMemoError(friendlyError(0, null, MSG.saveFailed))
    } finally {
      setMemoSaving(false)
    }
  }

  const title = tenant ? (editing ? `${tenant.name} 정보 수정` : tenant.name) : "기업 카드"

  // ── 보기 모드 ──
  const recv = data?.receivable
  const unpaidCount = recv?.count ?? tenant?.unpaid_count ?? 0
  const unpaidTotal = recv?.total ?? Number(tenant?.unpaid_total ?? 0)
  const rooms = roomsLabel(tenant?.contract_rooms)
  const roomCode = firstRoomCode(tenant?.contract_rooms)
  const lastLogin = tenant?.account_last_login

  const highlights = tenant
    ? [
        { label: "호실", value: rooms || "없음" },
        { label: "입주", value: tenant.contract_start ? fmtDate(tenant.contract_start) : "-" },
        {
          label: "받을 돈",
          value: unpaidCount > 0 ? (
            <span>
              {unpaidCount}건 <Money value={unpaidTotal} tone={(recv?.late_count ?? tenant.unpaid_late_count) > 0 ? "danger" : "default"} />
            </span>
          ) : (
            "없음"
          ),
        },
        {
          label: "포털 계정",
          value: tenant.account_id ? (lastLogin ? `${relative(lastLogin)} 로그인` : "로그인 안 함") : "없음",
        },
      ]
    : undefined

  const header = tenant ? (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge domain="tenant" status={tenant.status} />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="hover:bg-warm-beige hover:text-dark"
          onClick={() => onEditingChange(true)}
        >
          정보 수정
        </Button>
        <RowActions label={tenant.name} items={rowActions(tenant)} />
      </div>
      {actionError && (
        <Notice tone="danger" title="처리하지 못했어요" onClose={() => setActionError("")}>
          {actionError}
        </Notice>
      )}
    </div>
  ) : undefined

  const body = (content: (t: TenantRow, s: TenantSummary) => ReactNode) => {
    if (error && !data) {
      return <EmptyState kind="error" compact title="기업 정보를 불러오지 못했어요" description={error} onRetry={() => void load()} />
    }
    if (!data || !tenant) return <CardSkeleton lines={5} />
    return content(tenant, data)
  }

  const nextTodos = (t: TenantRow, s: TenantSummary) => {
    const items: { key: string; text: string; action: ReactNode }[] = []
    const mail = billMailTarget(t)
    if (mail.via === "none")
      items.push({
        key: "mail",
        text: "청구서 받을 메일이 없어요",
        action: (
          <Button type="button" size="sm" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={() => onEditingChange(true)}>
            정보 수정
          </Button>
        ),
      })
    if (!t.account_id && t.status === "active")
      items.push({
        key: "portal",
        text: "포털 계정이 없어요",
        action: (
          <Button type="button" size="sm" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={() => onTabChange("contact")}>
            포털 계정 만들기
          </Button>
        ),
      })
    if (s.receivable.count > 0)
      items.push({
        key: "recv",
        text: `받을 돈 ${s.receivable.count}건 ${won(s.receivable.total)}`,
        action: (
          <Button type="button" size="sm" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={() => onTabChange("bills")}>
            청구·납부 보기
          </Button>
        ),
      })
    if (!t.business_no || businessNoError(t.business_no))
      items.push({
        key: "bizno",
        text: t.business_no ? "사업자번호 형식을 확인해 주세요" : "사업자번호가 비어 있어요",
        action: (
          <Button type="button" size="sm" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={() => onEditingChange(true)}>
            정보 수정
          </Button>
        ),
      })
    if (t.status === "moved_out" && t.active_contracts > 0)
      items.push({
        key: "mismatch",
        text: "기업 상태는 ‘퇴실’인데 진행 중인 계약이 있어요. 청구는 계속돼요",
        action: (
          <Link href={roomsHref(roomCode ? { room: roomCode } : {})} className={linkCls}>
            호실 현황 열기 ›
          </Link>
        ),
      })
    return items
  }

  const tabs = CARD_TABS.map((t) => {
    let content: ReactNode
    switch (t.value) {
      case "overview":
        content = body((tn, s) => {
          const todos = nextTodos(tn, s)
          const mail = billMailTarget(tn)
          return (
            <div className="space-y-5">
              {todos.length > 0 && (
                <Section title="다음에 할 일" headingLevel={3} flush>
                  <ul className="divide-y divide-warm-tan/70">
                    {todos.map((it) => (
                      <li key={it.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                        <span className="text-base text-dark [word-break:keep-all]">{it.text}</span>
                        {it.action}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              <Section title="기본 정보" headingLevel={3}>
                <Dl
                  rows={[
                    { label: "사업자번호", value: tn.business_no || "-" },
                    { label: "대표자", value: tn.ceo_name || "-" },
                    { label: "연락처", value: tn.contact_phone || "-" },
                    {
                      label: "청구서 받을 메일",
                      value:
                        mail.via === "tax" ? (
                          mail.email
                        ) : mail.via === "contact" ? (
                          <span>
                            담당자 메일을 써요 <span className="text-[#5f6070]">({mail.email})</span>
                          </span>
                        ) : (
                          <ToneBadge tone="warning">없음</ToneBadge>
                        ),
                    },
                    { label: "청구 담당자", value: tn.manager_name || "-" },
                  ]}
                />
              </Section>
              <Section
                title="최근 청구"
                headingLevel={3}
                flush
                actions={
                  s.bills.length > 0 ? (
                    <button type="button" className={`text-[15px] ${linkCls}`} onClick={() => onTabChange("bills")}>
                      청구·납부 전체 ›
                    </button>
                  ) : undefined
                }
              >
                {s.bills.length === 0 ? (
                  <p className="px-4 py-3 text-base text-text-secondary">아직 청구서가 없어요</p>
                ) : (
                  <ul className="divide-y divide-warm-tan/70">
                    {s.bills.slice(0, 3).map((b) => {
                      const bb = billBadge(b)
                      return (
                        <li key={b.id}>
                          <Link href={billsHref({ bill: b.id })} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 hover:bg-warm-ivory">
                            <span className="min-w-20 text-base text-dark">{billMonthShort(b.period)}</span>
                            <Money value={b.total_amount} />
                            <StatusBadge domain="bill" status={bb.status} detail={bb.detail} className="ml-auto" />
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Section>
              {tn.memo && (
                <Section title="메모" headingLevel={3}>
                  <p className="line-clamp-2 whitespace-pre-line text-base text-dark">{tn.memo}</p>
                  <button type="button" className={`mt-1 text-[15px] ${linkCls}`} onClick={() => onTabChange("memo")}>
                    메모 전체 보기 ›
                  </button>
                </Section>
              )}
            </div>
          )
        })
        break
      case "contract":
        content = body((tn, s) => (
          <div className="space-y-4">
            {s.contracts.length === 0 ? (
              <EmptyState
                kind="first-use"
                compact
                bordered
                title="계약이 없어요"
                description="입주 처리는 호실 현황에서 해요"
                action={
                  <Button asChild size="sm" variant="outline" className="hover:bg-warm-beige hover:text-dark">
                    <Link href={roomsHref({ state: "vacant" })}>호실 현황 열기</Link>
                  </Button>
                }
              />
            ) : (
              s.contracts.map((c) => {
                const code = c.room_code
                const roomName = code ? (/^\d+$/.test(code) ? `${code}호` : code) : "호실 정보 없음"
                return (
                  <Section
                    key={c.id}
                    title={roomName}
                    headingLevel={3}
                    description={c.building ?? undefined}
                    actions={
                      <StatusBadge
                        domain="contract"
                        status={c.status}
                        detail={c.status === "ended" && c.ended_at ? `${fmtDate(c.ended_at)} 종료` : c.status === "active" && c.ended_at ? `${fmtDate(c.ended_at)} 종료 예정` : undefined}
                      />
                    }
                  >
                    <Dl
                      rows={[
                        {
                          label: "임대료",
                          value:
                            c.pyeong_billed && c.rent_unit_price
                              ? `${num(c.pyeong_billed, 1)}평 × 평당 ${won(c.rent_unit_price)}`
                              : "-",
                        },
                        { label: "관리비", value: c.mgmt_fee ? `월 ${won(c.mgmt_fee)}` : "-" },
                        {
                          label: "받은 보증금",
                          value: c.deposit_actual ? won(c.deposit_actual) : c.deposit_standard ? `기록 없음 (기준 ${won(c.deposit_standard)})` : "-",
                        },
                        { label: "시작일", value: c.start_date ? fmtDate(c.start_date) : "-" },
                        ...(c.deposit_returned_amount ? [{ label: "돌려준 보증금", value: won(c.deposit_returned_amount) }] : []),
                      ]}
                    />
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[15px]">
                      {c.status === "active" && code && (
                        <Link href={roomsHref({ room: code, action: "moveout" })} className={linkCls}>
                          호실 현황에서 퇴실 처리 ›
                        </Link>
                      )}
                      <Link href={billingSettingsHref({ tab: "contracts", contract: c.id })} className={linkCls}>
                        계약 조건 고치기 ›
                      </Link>
                    </div>
                  </Section>
                )
              })
            )}
            {tn.status === "moved_out" && tn.active_contracts > 0 && (
              <Notice tone="warning">기업 상태는 ‘퇴실’인데 진행 중인 계약이 있어요. 계약이 끝나야 청구가 멈춰요.</Notice>
            )}
          </div>
        ))
        break
      case "bills":
        content = body((tn, s) => {
          const r = s.receivable
          const oldest = r.oldest
          const oldestText = oldest
            ? oldest.due_date
              ? `가장 오래된 납기 ${due(oldest.due_date)}`
              : `가장 오래된 청구 ${billMonthShort(oldest.period)} · 납부 기한 없음 · ${sinceIssued(oldest.issued_at)}`
            : null
          return (
            <div className="space-y-4">
              {r.count > 0 ? (
                <div className="rounded-md border border-warm-tan bg-warm-ivory px-4 py-3">
                  <p className="text-base text-dark">
                    받을 돈 <strong className="font-semibold">{r.count}건</strong>{" "}
                    <Money value={r.total} strong tone={r.late_count > 0 ? "danger" : "default"} />
                  </p>
                  {oldestText && <p className="mt-0.5 text-[15px] text-[#5f6070]">{oldestText}</p>}
                  <div className="mt-2">
                    <CopyButton
                      value={paymentNoticeText({ tenantName: tn.name, bills: r.bills, total: r.total, bank, contactPhone })}
                      label="납부 안내 문구 복사"
                      successMessage="납부 안내 문구를 복사했어요"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-base text-dark">받을 돈이 없어요</p>
              )}
              {r.correcting_count > 0 && (
                <Notice tone="warning">정정 중인 청구서가 {r.correcting_count}건 있어요. 다시 발행해야 포털에 보여요.</Notice>
              )}
              {s.bills.length === 0 ? (
                <EmptyState kind="first-use" compact bordered title="아직 청구서가 없어요" description="월 마감에서 청구서를 만들면 여기에 보여요" />
              ) : (
                <div className="overflow-hidden rounded-md border border-warm-tan">
                  <Table className="text-[15px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>청구월</TableHead>
                        <TableHead className="text-right">합계</TableHead>
                        <TableHead>상태</TableHead>
                        <TableHead className="hidden sm:table-cell">납기</TableHead>
                        <TableHead className="hidden sm:table-cell">납부일</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {s.bills.map((b) => {
                        const bb = billBadge(b)
                        return (
                          <TableRow key={b.id} className="h-11">
                            <TableCell>
                              <Link href={billsHref({ bill: b.id })} className={linkCls}>
                                {billMonthShort(b.period)}
                                {b.is_manual ? " (추가)" : ""}
                              </Link>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              <Money value={b.total_amount} />
                            </TableCell>
                            <TableCell>
                              <StatusBadge domain="bill" status={bb.status} detail={bb.detail} />
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">{b.due_date ? dateShort(b.due_date) : "-"}</TableCell>
                            <TableCell className="hidden sm:table-cell">{b.paid_at ? dateShort(b.paid_at) : "-"}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              <Link href={billsHref({ q: tn.name, view: "month" })} className={`inline-block text-[15px] ${linkCls}`}>
                이 기업 청구서 모두 보기 ›
              </Link>
            </div>
          )
        })
        break
      case "contact":
        content = body((tn, s) => {
          const mail = billMailTarget(tn)
          return (
            <div className="space-y-5">
              <Section
                title="연락처·청구 메일"
                headingLevel={3}
                actions={
                  <Button type="button" size="sm" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={() => onEditingChange(true)}>
                    정보 수정
                  </Button>
                }
              >
                <Dl
                  rows={[
                    {
                      label: "청구서 받을 메일",
                      value: tn.tax_email || <span className="text-[#5f6070]">비어 있어요</span>,
                    },
                    { label: "청구 담당자", value: tn.manager_name || "-" },
                    { label: "담당자 메일", value: tn.contact_email || "-" },
                    { label: "연락처", value: tn.contact_phone || "-" },
                  ]}
                />
                <p className="mt-3 text-sm leading-relaxed text-[#5f6070] [word-break:keep-all]">
                  {mail.via === "none"
                    ? "청구서 받을 메일과 담당자 메일이 모두 비어 있어 청구서 발행 메일을 받을 곳이 없어요."
                    : mailEnabled
                      ? `청구서 발행 메일은 ${mail.email}로 가요${mail.via === "contact" ? "(청구서 받을 메일이 비어 담당자 메일을 써요)" : ""}. 납부 안내 메일은 담당자 메일로 가요.`
                      : `청구서 발행 메일을 받을 주소는 ${mail.email}예요${mail.via === "contact" ? "(청구서 받을 메일이 비어 담당자 메일을 써요)" : ""}. 지금은 메일 발송이 설정되지 않아 메일은 나가지 않아요.`}
                </p>
              </Section>
              <PortalAccountPanel
                tenant={tn}
                mailEnabled={mailEnabled}
                issued={issued}
                onIssued={(r) => {
                  setIssued(r)
                  toastSuccess(r.kind === "new" ? `${tn.name} 포털 계정을 만들었어요` : `${tn.name} 포털 비밀번호를 새로 만들었어요`)
                  void load(true)
                  onChanged()
                }}
                onDismissIssued={() => setIssued(null)}
              />
              <Section
                title="최근 메일"
                headingLevel={3}
                flush
                actions={
                  <Link href={emailsHref({ q: tn.name })} className={`text-[15px] ${linkCls}`}>
                    메일 기록 ›
                  </Link>
                }
              >
                {s.emails.length === 0 ? (
                  <p className="px-4 py-3 text-base text-text-secondary">이 기업에 보낸 메일 기록이 없어요</p>
                ) : (
                  <ul className="divide-y divide-warm-tan/70">
                    {s.emails.map((e) => {
                      const st = e.status === "failed" && isNotConfiguredError(e.error) ? "not_configured" : e.status
                      return (
                        <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                          <span className="text-base text-dark">{mailLabel(e.template_code, e.subject)}</span>
                          <StatusBadge domain="email" status={st} showDefaultDetail={false} />
                          <span className="ml-auto text-sm text-[#5f6070]" title={dateTime(e.created_at)}>
                            {relative(e.created_at)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Section>
            </div>
          )
        })
        break
      case "memo":
        content = body((tn, s) => (
          <div className="space-y-5">
            <div className="grid gap-1.5">
              <Label htmlFor="card-memo" className="text-base font-medium text-dark">
                메모
              </Label>
              <Textarea id="card-memo" rows={6} value={memo} onChange={(e) => setMemo(e.target.value)} className="bg-card text-base" />
              {memoError && (
                <Notice tone="danger" title={MSG.saveFailed}>
                  {memoError}
                </Notice>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <BusyButton type="button" busy={memoSaving} busyLabel={MSG.busySave} onClick={() => void saveMemo()} disabled={!memoDirty && !memoSaving}>
                  메모 저장하기
                </BusyButton>
                {memoDirty && <span className="text-sm text-[#5f6070]">저장하지 않은 변경이 있어요</span>}
              </div>
            </div>
            <Section
              title="관리자 메모·확인 사항"
              description="홈의 메모 중 이 기업 이름이 들어간 것이에요"
              headingLevel={3}
              flush
            >
              {s.notes.length === 0 ? (
                <p className="px-4 py-3 text-base text-text-secondary">이 기업 이름이 들어간 메모가 없어요</p>
              ) : (
                <ul className="divide-y divide-warm-tan/70">
                  {s.notes.map((n) => (
                    <li key={n.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                      <span className="min-w-0 flex-1 text-base text-dark [word-break:keep-all]">{n.title}</span>
                      <StatusBadge domain="note" status={n.status} />
                      <span className="text-sm text-[#5f6070]">{dateShort(n.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-warm-tan/70 px-4 py-2.5">
                <Link href="/admin" className={`text-[15px] ${linkCls}`}>
                  홈에서 메모 보기 ›
                </Link>
              </div>
            </Section>
          </div>
        ))
        break
    }
    // 발급 결과가 보이는 동안 링크로 떠나는 것을 막는 감시(guardLinks)를 모든 탭 내용에 건다
    return { value: t.value, label: t.label, content: <div onClickCapture={guardLinks}>{content}</div> }
  })

  const editFooter = (
    <>
      <Button type="button" variant="outline" className="hover:bg-warm-beige hover:text-dark" disabled={form.saving} onClick={() => void leaveEdit()}>
        닫기
      </Button>
      <BusyButton type="button" busy={form.saving} busyLabel={MSG.busySave} onClick={() => void form.submit()}>
        저장하기
      </BusyButton>
    </>
  )

  // 보기·편집 모드가 같은 시트를 쓴다(시트가 닫혔다 열리지 않게 한 번만 그린다)
  return (
    <DetailSheet
      open
      onOpenChange={(o) => {
        if (!o) void requestClose()
      }}
      title={title}
      description={editing ? "바꾼 칸만 저장해요" : undefined}
      badge={editing ? undefined : header}
      highlights={editing ? undefined : highlights}
      tabs={editing ? undefined : tabs}
      tab={tab}
      onTabChange={(v) => onTabChange(v as TenantCardTab)}
      dirty={editing ? form.dirty : memoDirty}
      footer={editing && tenant ? editFooter : undefined}
      size="lg"
    >
      {editing ? tenant ? form.body : <CardSkeleton lines={6} /> : null}
    </DetailSheet>
  )
}
