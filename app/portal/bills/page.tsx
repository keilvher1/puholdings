"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ChevronRight } from "lucide-react"
import { formatWon } from "@/lib/billing"

interface PortalBill {
  id: number
  period: string
  total_amount: string
  status: "issued" | "paid" | "overdue"
  due_date: string | null
  paid_at: string | null
}

function statusBadge(status: PortalBill["status"]) {
  if (status === "paid") return <Badge className="bg-green-700 text-white">납부 완료</Badge>
  if (status === "overdue") return <Badge variant="destructive">연체</Badge>
  return <Badge>납부 대기</Badge>
}

export default function PortalBillsPage() {
  const [bills, setBills] = useState<PortalBill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/portal/bills", { credentials: "include" })
        const data = await res.json()
        if (data.success) {
          setBills(data.bills)
        } else {
          setError(data.error || "청구서를 불러오지 못했습니다")
        }
      } catch {
        setError("서버 오류가 발생했습니다")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">청구서</h1>
        <p className="mt-1 text-sm text-text-secondary">월별 관리비 청구 내역입니다</p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      <div className="rounded-lg border border-warm-tan bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>청구월</TableHead>
              <TableHead className="text-right">금액</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>납부 기한</TableHead>
              <TableHead className="w-10" />
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
                  청구 내역이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              bills.map((bill) => (
                <TableRow key={bill.id} className="cursor-pointer">
                  <TableCell className="p-0" colSpan={5}>
                    <Link href={`/portal/bills/${bill.id}`} className="flex items-center">
                      <span className="flex-1 px-4 py-3 font-medium text-dark">{bill.period}</span>
                      <span className="w-32 px-4 py-3 text-right font-medium">
                        {formatWon(bill.total_amount)}원
                      </span>
                      <span className="w-28 px-4 py-3">{statusBadge(bill.status)}</span>
                      <span className="w-32 px-4 py-3 text-sm text-text-secondary">
                        {bill.due_date || "-"}
                      </span>
                      <span className="w-10 px-4 py-3 text-text-secondary">
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
