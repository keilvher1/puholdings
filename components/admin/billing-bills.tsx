"use client"

import { useCallback, useEffect, useState } from "react"
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
import { Send, Plus, Trash2 } from "lucide-react"
import { formatWon, BILL_STATUS_LABELS } from "@/lib/billing"

interface Bill {
  id: number
  tenant_id: number
  tenant_name: string
  room_no: string | null
  contact_email: string | null
  period: string
  total_amount: string
  status: "draft" | "issued" | "paid" | "overdue"
  due_date: string | null
  issued_at: string | null
  paid_at: string | null
  memo: string | null
}

interface LineEdit {
  item_id: number | null
  label: string
  quantity: string
  unit_price: string
  amount: string
}

function currentPeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function statusBadge(status: Bill["status"]) {
  const label = BILL_STATUS_LABELS[status] || status
  if (status === "paid") return <Badge className="bg-green-700 text-white">{label}</Badge>
  if (status === "overdue") return <Badge variant="destructive">{label}</Badge>
  if (status === "issued") return <Badge>{label}</Badge>
  return <Badge variant="secondary">{label}</Badge>
}

export function BillingBills() {
  const [period, setPeriod] = useState(currentPeriod())
  const [statusFilter, setStatusFilter] = useState("all")
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // 일괄 발행 Dialog
  const [issueOpen, setIssueOpen] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [issueResult, setIssueResult] = useState<{
    issued: number
    mail: { sent: number; failed: number }
    no_email: string[]
  } | null>(null)
  const [issueError, setIssueError] = useState("")

  // 상세 Dialog
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<Bill | null>(null)
  const [lines, setLines] = useState<LineEdit[]>([])
  const [memo, setMemo] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailSaving, setDetailSaving] = useState(false)
  const [detailError, setDetailError] = useState("")

  const fetchBills = useCallback(async (p: string, status: string) => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams({ period: p })
      if (status !== "all") params.set("status", status)
      const res = await fetch(`/api/admin/billing/bills?${params}`, { credentials: "include" })
      const data = await res.json()
      if (data.success) {
        setBills(data.bills)
      } else {
        setError(data.error || "목록을 불러오지 못했습니다")
      }
    } catch {
      setError("서버 오류가 발생했습니다")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBills(period, statusFilter)
  }, [fetchBills, period, statusFilter])

  const draftCount = bills.filter((b) => b.status === "draft").length

  const openIssue = () => {
    setIssueResult(null)
    setIssueError("")
    setIssueOpen(true)
  }

  const handleIssue = async () => {
    setIssuing(true)
    setIssueError("")
    try {
      const res = await fetch("/api/admin/billing/bills/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ period }),
      })
      const data = await res.json()
      if (data.success) {
        setIssueResult({ issued: data.issued, mail: data.mail, no_email: data.no_email })
        fetchBills(period, statusFilter)
      } else {
        setIssueError(data.error || "발행에 실패했습니다")
      }
    } catch {
      setIssueError("서버 오류가 발생했습니다")
    } finally {
      setIssuing(false)
    }
  }

  const openDetail = async (bill: Bill) => {
    setDetail(bill)
    setLines([])
    setMemo(bill.memo || "")
    setDueDate(bill.due_date || "")
    setDetailError("")
    setDetailLoading(true)
    setDetailOpen(true)
    try {
      const res = await fetch(`/api/admin/billing/bills?id=${bill.id}`, { credentials: "include" })
      const data = await res.json()
      if (data.success) {
        setDetail({ ...bill, ...data.bill })
        setMemo(data.bill.memo || "")
        setDueDate(data.bill.due_date || "")
        setLines(
          data.lines.map((l: { item_id: number | null; label: string; quantity: string | null; unit_price: string | null; amount: string }) => ({
            item_id: l.item_id,
            label: l.label,
            quantity: l.quantity === null ? "" : String(Number(l.quantity)),
            unit_price: l.unit_price === null ? "" : String(Number(l.unit_price)),
            amount: String(Number(l.amount)),
          }))
        )
      } else {
        setDetailError(data.error || "상세를 불러오지 못했습니다")
      }
    } catch {
      setDetailError("서버 오류가 발생했습니다")
    } finally {
      setDetailLoading(false)
    }
  }

  const isDraft = detail?.status === "draft"
  const canMarkPaid = detail?.status === "issued" || detail?.status === "overdue"
  const linesTotal = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0)

  const setLine = (index: number, patch: Partial<LineEdit>) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l
        const next = { ...l, ...patch }
        // 수량·단가가 모두 있으면 금액 자동 계산
        if (("quantity" in patch || "unit_price" in patch) && next.quantity !== "" && next.unit_price !== "") {
          const q = Number(next.quantity)
          const u = Number(next.unit_price)
          if (Number.isFinite(q) && Number.isFinite(u)) {
            next.amount = String(Math.round(q * u))
          }
        }
        return next
      })
    )
  }

  const handleDetailSave = async () => {
    if (!detail) return
    setDetailSaving(true)
    setDetailError("")
    try {
      const body: Record<string, unknown> = { id: detail.id, memo }
      if (isDraft) {
        if (dueDate) body.due_date = dueDate
        body.lines = lines.map((l) => ({
          item_id: l.item_id,
          label: l.label,
          quantity: l.quantity === "" ? null : Number(l.quantity),
          unit_price: l.unit_price === "" ? null : Number(l.unit_price),
          amount: Number(l.amount) || 0,
        }))
      }
      const res = await fetch("/api/admin/billing/bills", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        setDetailOpen(false)
        fetchBills(period, statusFilter)
      } else {
        setDetailError(data.error || "저장에 실패했습니다")
      }
    } catch {
      setDetailError("서버 오류가 발생했습니다")
    } finally {
      setDetailSaving(false)
    }
  }

  const handleMarkPaid = async () => {
    if (!detail) return
    if (!confirm(`${detail.tenant_name}의 ${detail.period} 청구서를 납부 완료 처리할까요?`)) return
    setDetailSaving(true)
    setDetailError("")
    try {
      const res = await fetch("/api/admin/billing/bills", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: detail.id, mark_paid: true }),
      })
      const data = await res.json()
      if (data.success) {
        setDetailOpen(false)
        fetchBills(period, statusFilter)
      } else {
        setDetailError(data.error || "처리에 실패했습니다")
      }
    } catch {
      setDetailError("서버 오류가 발생했습니다")
    } finally {
      setDetailSaving(false)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Input
            type="month"
            value={period}
            onChange={(e) => e.target.value && setPeriod(e.target.value)}
            className="w-40"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="draft">작성 중</SelectItem>
              <SelectItem value="issued">발행됨</SelectItem>
              <SelectItem value="paid">납부 완료</SelectItem>
              <SelectItem value="overdue">연체</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={openIssue} disabled={draftCount === 0}>
          <Send className="h-4 w-4" />
          일괄 발행 ({draftCount}건)
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      <div className="rounded-lg border border-warm-tan bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>기업</TableHead>
              <TableHead className="text-right">합계</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>납기</TableHead>
              <TableHead>납부일</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-text-secondary">
                  불러오는 중...
                </TableCell>
              </TableRow>
            ) : bills.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-text-secondary">
                  {period}의 청구서가 없습니다. 검침 입력 후 청구서를 생성하세요.
                </TableCell>
              </TableRow>
            ) : (
              bills.map((bill) => (
                <TableRow
                  key={bill.id}
                  className="cursor-pointer"
                  onClick={() => openDetail(bill)}
                >
                  <TableCell>
                    <div className="font-medium text-dark">{bill.tenant_name}</div>
                    {bill.room_no && <div className="text-xs text-text-secondary">{bill.room_no}</div>}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatWon(bill.total_amount)}원
                  </TableCell>
                  <TableCell>{statusBadge(bill.status)}</TableCell>
                  <TableCell className="text-sm text-text-secondary">{bill.due_date || "-"}</TableCell>
                  <TableCell className="text-sm text-text-secondary">
                    {bill.paid_at ? new Date(bill.paid_at).toLocaleDateString("ko-KR") : "-"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 일괄 발행 Dialog */}
      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{period} 청구서 일괄 발행</DialogTitle>
            <DialogDescription>
              작성 중인 청구서 {draftCount}건을 발행하고, 각 기업 담당자 이메일로 청구서 메일을
              발송합니다. 발행 후에는 항목을 수정할 수 없습니다.
            </DialogDescription>
          </DialogHeader>

          {issueResult ? (
            <div className="grid gap-3">
              <div className="rounded-md bg-warm-beige px-4 py-3 text-sm">
                <p className="font-medium text-dark">
                  발행 {issueResult.issued}건 · 메일 성공 {issueResult.mail.sent}건
                  {issueResult.mail.failed > 0 && `, 실패 ${issueResult.mail.failed}건`}
                </p>
                {issueResult.no_email.length > 0 && (
                  <p className="mt-1 text-xs text-text-secondary">
                    이메일 없음(발송 제외): {issueResult.no_email.join(", ")}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button onClick={() => setIssueOpen(false)}>닫기</Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              {issueError && (
                <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {issueError}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setIssueOpen(false)} disabled={issuing}>
                  취소
                </Button>
                <Button onClick={handleIssue} disabled={issuing}>
                  {issuing ? "발행 중..." : `${draftCount}건 발행`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 상세 Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {detail?.tenant_name} · {detail?.period}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              {detail && statusBadge(detail.status)}
              {detail?.contact_email && <span className="text-xs">{detail.contact_email}</span>}
            </DialogDescription>
          </DialogHeader>

          {detailError && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {detailError}
            </div>
          )}

          {detailLoading ? (
            <p className="py-8 text-center text-sm text-text-secondary">불러오는 중...</p>
          ) : (
            <div className="grid gap-4">
              <div className="rounded-md border border-warm-tan">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>항목</TableHead>
                      <TableHead className="w-24 text-right">수량</TableHead>
                      <TableHead className="w-28 text-right">단가</TableHead>
                      <TableHead className="w-32 text-right">금액(원)</TableHead>
                      {isDraft && <TableHead className="w-10" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          {isDraft ? (
                            <Input
                              value={line.label}
                              onChange={(e) => setLine(i, { label: e.target.value })}
                              className="h-8 text-sm"
                            />
                          ) : (
                            line.label
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isDraft ? (
                            <Input
                              type="number"
                              value={line.quantity}
                              onChange={(e) => setLine(i, { quantity: e.target.value })}
                              className="h-8 text-right text-sm"
                            />
                          ) : (
                            line.quantity || "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isDraft ? (
                            <Input
                              type="number"
                              value={line.unit_price}
                              onChange={(e) => setLine(i, { unit_price: e.target.value })}
                              className="h-8 text-right text-sm"
                            />
                          ) : line.unit_price ? (
                            formatWon(line.unit_price)
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isDraft ? (
                            <Input
                              type="number"
                              value={line.amount}
                              onChange={(e) => setLine(i, { amount: e.target.value })}
                              className="h-8 text-right text-sm"
                            />
                          ) : (
                            formatWon(line.amount)
                          )}
                        </TableCell>
                        {isDraft && (
                          <TableCell>
                            <button
                              onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                              className="text-text-secondary hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={isDraft ? 3 : 3} className="font-medium">
                        합계
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatWon(linesTotal)}원
                      </TableCell>
                      {isDraft && <TableCell />}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {isDraft && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setLines((prev) => [...prev, { item_id: null, label: "", quantity: "", unit_price: "", amount: "0" }])
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  항목 추가
                </Button>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="bill-due">납부 기한</Label>
                  <Input
                    id="bill-due"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    disabled={!isDraft}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="bill-memo">메모</Label>
                  <Input
                    id="bill-memo"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {canMarkPaid && (
              <Button
                variant="outline"
                onClick={handleMarkPaid}
                disabled={detailSaving}
                className="mr-auto"
              >
                납부 확인
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetailOpen(false)} disabled={detailSaving}>
              닫기
            </Button>
            {(isDraft || canMarkPaid) && (
              <Button onClick={handleDetailSave} disabled={detailSaving || detailLoading}>
                {detailSaving ? "저장 중..." : "저장"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
