"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { AdminCard } from "@/components/admin/admin-ui"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { formatWon, BILL_STATUS_LABELS } from "@/lib/billing"

interface Bill {
  id: number; tenant_id: number; tenant_name: string; period: string
  rent_total: string; mgmt_total: string; elec_amount: string; total_amount: string
  status: "draft" | "issued" | "paid" | "overdue"; due_date: string | null; paid_at: string | null; is_manual: boolean
}
interface Line { id: number; room_code: string | null; line_type: string; label: string; amount: string }

function thisMonth(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`
}
function badge(s: Bill["status"]) {
  if (s === "paid") return <Badge className="bg-green-700 text-white">{BILL_STATUS_LABELS[s]}</Badge>
  if (s === "overdue") return <Badge variant="destructive">{BILL_STATUS_LABELS[s]}</Badge>
  if (s === "issued") return <Badge>{BILL_STATUS_LABELS[s]}</Badge>
  return <Badge variant="secondary">{BILL_STATUS_LABELS[s]}</Badge>
}

export function BillsList() {
  const [period, setPeriod] = useState(thisMonth())
  const [status, setStatus] = useState("all")
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<Bill | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [payDate, setPayDate] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ period })
      if (status !== "all") q.set("status", status)
      const res = await fetch(`/api/admin/billing/bills?${q}`, { credentials: "include" })
      const d = await res.json()
      if (d.success) setBills(d.bills)
    } finally { setLoading(false) }
  }, [period, status])

  useEffect(() => { load() }, [load])

  const open = async (b: Bill) => {
    setDetail(b); setLines([]); setPayDate("")
    const res = await fetch(`/api/admin/billing/bills?id=${b.id}`, { credentials: "include" })
    const d = await res.json()
    if (d.success) { setDetail(d.bill); setLines(d.lines) }
  }

  const markPaid = async () => {
    if (!detail) return
    const res = await fetch("/api/admin/billing/bills", {
      method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ id: detail.id, mark_paid: true, paid_at: payDate || undefined }),
    })
    const d = await res.json()
    if (d.success) { setDetail(null); load() } else alert(d.error || "처리 실패")
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Input type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} className="w-40" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="draft">작성 중</SelectItem>
            <SelectItem value="issued">발행됨</SelectItem>
            <SelectItem value="paid">납부 완료</SelectItem>
            <SelectItem value="overdue">연체</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <AdminCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>기업</TableHead>
              <TableHead className="text-right">임대+관리</TableHead>
              <TableHead className="text-right">전기</TableHead>
              <TableHead className="text-right">합계</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>납기</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-text-secondary">불러오는 중...</TableCell></TableRow>
            ) : bills.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-text-secondary">{period} 청구서가 없습니다. 월 마감에서 생성하세요.</TableCell></TableRow>
            ) : bills.map((b) => (
              <TableRow key={b.id} className="cursor-pointer" onClick={() => open(b)}>
                <TableCell>
                  <span className="font-medium text-dark">{b.tenant_name}</span>
                  {b.is_manual && <Badge variant="outline" className="ml-2">수동</Badge>}
                </TableCell>
                <TableCell className="text-right">{formatWon(Number(b.rent_total) + Number(b.mgmt_total))}원</TableCell>
                <TableCell className="text-right">{formatWon(b.elec_amount)}원</TableCell>
                <TableCell className="text-right font-medium">{formatWon(b.total_amount)}원</TableCell>
                <TableCell>{badge(b.status)}</TableCell>
                <TableCell className="text-sm text-text-secondary">{b.due_date || "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AdminCard>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.tenant_name} · {detail?.period}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="grid gap-4">
              <div className="rounded-md border border-warm-tan">
                <Table>
                  <TableHeader><TableRow><TableHead>항목</TableHead><TableHead className="text-right">금액</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {lines.map((l) => (
                      <TableRow key={l.id}><TableCell className="text-sm">{l.label}</TableCell><TableCell className="text-right">{formatWon(l.amount)}원</TableCell></TableRow>
                    ))}
                    <TableRow><TableCell className="font-bold">합계</TableCell><TableCell className="text-right font-bold">{formatWon(detail.total_amount)}원</TableCell></TableRow>
                  </TableBody>
                </Table>
              </div>
              {(detail.status === "issued" || detail.status === "overdue") && (
                <div className="flex items-end gap-2">
                  <div className="grid gap-1.5">
                    <label className="text-xs text-text-secondary">이체일</label>
                    <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="h-9" />
                  </div>
                  <Button onClick={markPaid}>납부 확인</Button>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {detail && (
              <Button variant="outline" asChild className="mr-auto">
                <a href={`/api/admin/billing/bills/preview?id=${detail.id}`} target="_blank" rel="noreferrer">청구서 PDF 미리보기</a>
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetail(null)}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
