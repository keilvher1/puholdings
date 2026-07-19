"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Download, Upload, FileSpreadsheet, Save } from "lucide-react"
import { formatWon } from "@/lib/billing"

interface MeteredItem {
  id: number
  name: string
  unit: string | null
  unit_price: string
}

interface ReadingRow {
  tenant_id: number
  tenant_name: string
  room_no: string | null
  cells: Record<number, { prev_value: string; curr_value: string | null; saved: boolean }>
}

type CellEdits = Record<string, { prev: string; curr: string }>

function currentPeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

export function BillingReadings() {
  const [period, setPeriod] = useState(currentPeriod())
  const [items, setItems] = useState<MeteredItem[]>([])
  const [rows, setRows] = useState<ReadingRow[]>([])
  const [edits, setEdits] = useState<CellEdits>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importErrors, setImportErrors] = useState<{ row: number; message: string }[]>([])

  // 청구서 생성 Dialog
  const [genOpen, setGenOpen] = useState(false)
  const [dueDate, setDueDate] = useState("")
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState<{
    created: number
    regenerated: number
    skipped: { tenant_name: string; reason: string }[]
  } | null>(null)
  const [genError, setGenError] = useState("")

  const fetchMatrix = useCallback(async (p: string) => {
    setLoading(true)
    setMessage(null)
    setImportErrors([])
    try {
      const res = await fetch(`/api/admin/billing/readings?period=${p}`, { credentials: "include" })
      const data = await res.json()
      if (data.success) {
        setItems(data.items)
        setRows(data.rows)
        const initial: CellEdits = {}
        for (const row of data.rows as ReadingRow[]) {
          for (const item of data.items as MeteredItem[]) {
            const cell = row.cells[item.id]
            initial[`${row.tenant_id}:${item.id}`] = {
              prev: cell?.prev_value ?? "0",
              curr: cell?.curr_value ?? "",
            }
          }
        }
        setEdits(initial)
      } else {
        setMessage({ type: "error", text: data.error || "불러오지 못했습니다" })
      }
    } catch {
      setMessage({ type: "error", text: "서버 오류가 발생했습니다" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMatrix(period)
  }, [fetchMatrix, period])

  const setCell = (tenantId: number, itemId: number, field: "prev" | "curr", value: string) => {
    const key = `${tenantId}:${itemId}`
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }))
  }

  const usage = (key: string): number | null => {
    const cell = edits[key]
    if (!cell || cell.curr === "" || cell.prev === "") return null
    const u = Number(cell.curr) - Number(cell.prev)
    return Number.isFinite(u) ? u : null
  }

  const handleSave = async () => {
    const readings = []
    let prevOnlyEdits = 0
    for (const row of rows) {
      for (const item of items) {
        const key = `${row.tenant_id}:${item.id}`
        const cell = edits[key]
        if (!cell || cell.curr === "") {
          // 당월지침 없이 전월지침만 고친 셀은 저장되지 않음을 알린다
          if (cell && cell.prev !== (row.cells[item.id]?.prev_value ?? "0")) prevOnlyEdits++
          continue
        }
        readings.push({
          tenant_id: row.tenant_id,
          item_id: item.id,
          prev_value: Number(cell.prev || 0),
          curr_value: Number(cell.curr),
        })
      }
    }
    if (readings.length === 0) {
      setMessage({ type: "error", text: "저장할 검침값이 없습니다 (당월지침이 입력된 셀만 저장됩니다)" })
      return
    }
    if (prevOnlyEdits > 0 && !confirm(`당월지침이 비어 있어 저장되지 않는 전월지침 수정이 ${prevOnlyEdits}건 있습니다. 계속할까요?`)) {
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch("/api/admin/billing/readings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ period, readings }),
      })
      const data = await res.json()
      if (data.success) {
        const errText = data.errors?.length ? ` (오류 ${data.errors.length}건: ${data.errors[0]})` : ""
        setMessage({ type: data.errors?.length ? "error" : "ok", text: `${data.saved}건 저장됨${errText}` })
        fetchMatrix(period)
      } else {
        setMessage({ type: "error", text: data.error || "저장에 실패했습니다" })
      }
    } catch {
      setMessage({ type: "error", text: "서버 오류가 발생했습니다" })
    } finally {
      setSaving(false)
    }
  }

  const handleImport = async (file: File) => {
    setImporting(true)
    setMessage(null)
    setImportErrors([])
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("period", period)
      const res = await fetch("/api/admin/billing/readings/import", {
        method: "POST",
        credentials: "include",
        body: formData,
      })
      const data = await res.json()
      if (data.success) {
        setMessage({
          type: data.errors.length ? "error" : "ok",
          text: `${data.saved}건 저장됨${data.errors.length ? `, 오류 ${data.errors.length}건` : ""}`,
        })
        setImportErrors(data.errors)
        fetchMatrix(period)
      } else {
        setMessage({ type: "error", text: data.error || "업로드에 실패했습니다" })
      }
    } catch {
      setMessage({ type: "error", text: "서버 오류가 발생했습니다" })
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const openGenerate = () => {
    // 기본 납기: 다음 달 25일
    const [y, m] = period.split("-").map(Number)
    const next = new Date(Date.UTC(y, m, 25))
    setDueDate(next.toISOString().slice(0, 10))
    setGenResult(null)
    setGenError("")
    setGenOpen(true)
  }

  const handleGenerate = async () => {
    if (!dueDate) {
      setGenError("납부 기한을 입력해주세요")
      return
    }
    setGenerating(true)
    setGenError("")
    try {
      const res = await fetch("/api/admin/billing/bills/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ period, due_date: dueDate }),
      })
      const data = await res.json()
      if (data.success) {
        setGenResult({ created: data.created, regenerated: data.regenerated, skipped: data.skipped })
      } else {
        setGenError(data.error || "생성에 실패했습니다")
      }
    } catch {
      setGenError("서버 오류가 발생했습니다")
    } finally {
      setGenerating(false)
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
          <Button variant="outline" asChild>
            <a href={`/api/admin/billing/readings/template?period=${period}`}>
              <Download className="h-4 w-4" />
              엑셀 템플릿
            </a>
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            <Upload className="h-4 w-4" />
            {importing ? "업로드 중..." : "엑셀 업로드"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleImport(f)
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleSave} disabled={saving || loading}>
            <Save className="h-4 w-4" />
            {saving ? "저장 중..." : "검침 저장"}
          </Button>
          <Button onClick={openGenerate} disabled={loading}>
            <FileSpreadsheet className="h-4 w-4" />
            청구서 생성
          </Button>
        </div>
      </div>

      {message && (
        <div
          className={`mb-4 rounded-md px-4 py-3 text-sm ${
            message.type === "ok" ? "bg-warm-beige text-dark" : "bg-destructive/10 text-destructive"
          }`}
        >
          {message.text}
        </div>
      )}
      {importErrors.length > 0 && (
        <div className="mb-4 max-h-40 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs text-destructive">
          {importErrors.map((e, i) => (
            <p key={i}>
              {e.row}행: {e.message}
            </p>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-warm-tan bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-40">기업</TableHead>
              {items.map((item) => (
                <TableHead key={item.id} className="min-w-60 text-center">
                  {item.name}
                  <span className="ml-1 text-xs font-normal text-text-secondary">
                    ({item.unit || "-"} · {formatWon(item.unit_price)}원)
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={items.length + 1} className="py-10 text-center text-text-secondary">
                  불러오는 중...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={items.length + 1} className="py-10 text-center text-text-secondary">
                  입주 중인 기업이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.tenant_id}>
                  <TableCell>
                    <div className="font-medium text-dark">{row.tenant_name}</div>
                    {row.room_no && <div className="text-xs text-text-secondary">{row.room_no}</div>}
                  </TableCell>
                  {items.map((item) => {
                    const key = `${row.tenant_id}:${item.id}`
                    const cell = edits[key]
                    const u = usage(key)
                    const saved = row.cells[item.id]?.saved
                    return (
                      <TableCell key={item.id}>
                        <div className="flex items-center gap-1.5">
                          <div className="grid gap-0.5">
                            <span className="text-[10px] text-text-secondary">전월</span>
                            <Input
                              type="number"
                              value={cell?.prev ?? ""}
                              onChange={(e) => setCell(row.tenant_id, item.id, "prev", e.target.value)}
                              className="h-8 w-24 text-right text-sm"
                            />
                          </div>
                          <div className="grid gap-0.5">
                            <span className="text-[10px] text-text-secondary">당월</span>
                            <Input
                              type="number"
                              value={cell?.curr ?? ""}
                              onChange={(e) => setCell(row.tenant_id, item.id, "curr", e.target.value)}
                              className={`h-8 w-24 text-right text-sm ${saved ? "" : "border-gold/60"}`}
                              placeholder="-"
                            />
                          </div>
                          <div className="grid gap-0.5 text-right">
                            <span className="text-[10px] text-text-secondary">사용량</span>
                            <span className={`text-sm ${u !== null && u < 0 ? "text-destructive" : "text-dark"}`}>
                              {u !== null ? u : "-"}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 청구서 생성 Dialog */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{period} 청구서 생성</DialogTitle>
            <DialogDescription>
              입주 중인 기업별로 검침(사용량×단가)과 정액 항목을 합산해 청구서 초안을 만듭니다.
              이미 발행된 청구서는 건드리지 않습니다.
            </DialogDescription>
          </DialogHeader>

          {genResult ? (
            <div className="grid gap-3">
              <div className="rounded-md bg-warm-beige px-4 py-3 text-sm">
                <p className="font-medium text-dark">
                  생성 {genResult.created}건, 재생성 {genResult.regenerated}건
                  {genResult.skipped.length > 0 && `, 스킵 ${genResult.skipped.length}건`}
                </p>
                {genResult.skipped.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-text-secondary">
                    {genResult.skipped.map((s, i) => (
                      <li key={i}>
                        {s.tenant_name}: {s.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setGenOpen(false)}>
                  닫기
                </Button>
                <Button asChild>
                  <Link href="/admin/billing/bills">청구서 확인</Link>
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              {genError && (
                <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {genError}
                </div>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="gen-due">납부 기한</Label>
                <Input
                  id="gen-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setGenOpen(false)} disabled={generating}>
                  취소
                </Button>
                <Button onClick={handleGenerate} disabled={generating}>
                  {generating ? "생성 중..." : "생성"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
