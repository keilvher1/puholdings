"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ArrowLeft, Printer, Download } from "lucide-react"
import { formatWon } from "@/lib/billing"

interface BillDetail {
  id: number
  period: string
  total_amount: string
  status: "issued" | "paid" | "overdue"
  due_date: string | null
  issued_at: string | null
  paid_at: string | null
  tenant_name: string
  room_no: string | null
  invoice_pathname: string | null
}

interface BillLine {
  id: number
  label: string
  quantity: string | null
  unit_price: string | null
  amount: string
  unit: string | null
}

function statusBadge(status: BillDetail["status"]) {
  if (status === "paid") return <Badge className="bg-green-700 text-white">납부 완료</Badge>
  if (status === "overdue") return <Badge variant="destructive">연체</Badge>
  return <Badge>납부 대기</Badge>
}

export default function PortalBillDetailPage() {
  const params = useParams<{ id: string }>()
  const [bill, setBill] = useState<BillDetail | null>(null)
  const [lines, setLines] = useState<BillLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/portal/bills/${params.id}`, { credentials: "include" })
        const data = await res.json()
        if (data.success) {
          setBill(data.bill)
          setLines(data.lines)
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
  }, [params.id])

  if (loading) {
    return <p className="py-10 text-center text-sm text-text-secondary">불러오는 중...</p>
  }
  if (error || !bill) {
    return (
      <div className="py-10 text-center">
        <p className="mb-4 text-sm text-destructive">{error || "청구서를 찾을 수 없습니다"}</p>
        <Button variant="outline" asChild>
          <Link href="/portal/bills">
            <ArrowLeft className="h-4 w-4" />
            목록으로
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between print:hidden">
        <div>
          <Link
            href="/portal/bills"
            className="mb-2 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-dark"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            청구서 목록
          </Link>
          <h1 className="text-2xl font-bold text-dark">{bill.period} 청구서</h1>
        </div>
        <div className="flex gap-2">
          {bill.invoice_pathname && (
            <Button variant="outline" asChild>
              <a href={`/api/file?pathname=${encodeURIComponent(bill.invoice_pathname)}&download=1&name=${encodeURIComponent(`청구서_${bill.period}.pdf`)}`}>
                <Download className="h-4 w-4" />
                청구서 PDF
              </a>
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            인쇄
          </Button>
        </div>
      </div>

      {/* 인쇄 영역 */}
      <div className="rounded-lg border border-warm-tan bg-card p-6 print:border-0 print:p-0">
        <div className="mb-6 hidden print:block">
          <h1 className="text-xl font-bold">{bill.period} 관리비 청구서</h1>
          <p className="mt-1 text-sm text-gray-600">포항연합기술지주 창업보육센터</p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-text-secondary">기업명</p>
            <p className="font-medium text-dark">{bill.tenant_name}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary">호실</p>
            <p className="font-medium text-dark">{bill.room_no || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary">납부 기한</p>
            <p className="font-medium text-dark">{bill.due_date || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary">상태</p>
            <div>{statusBadge(bill.status)}</div>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>항목</TableHead>
              <TableHead className="text-right">산출 내역</TableHead>
              <TableHead className="text-right">금액</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="font-medium text-dark">{line.label}</TableCell>
                <TableCell className="text-right text-sm text-text-secondary">
                  {line.quantity !== null && line.unit_price !== null
                    ? `${Number(line.quantity)}${line.unit || ""} × ${formatWon(line.unit_price)}원`
                    : "정액"}
                </TableCell>
                <TableCell className="text-right">{formatWon(line.amount)}원</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={2} className="font-bold text-dark">
                합계
              </TableCell>
              <TableCell className="text-right text-lg font-bold text-dark">
                {formatWon(bill.total_amount)}원
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        {bill.paid_at && (
          <p className="mt-4 text-sm text-text-secondary">
            납부 확인일: {new Date(bill.paid_at).toLocaleDateString("ko-KR")}
          </p>
        )}
      </div>
    </div>
  )
}
