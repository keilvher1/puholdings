"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Pencil, Trash2, Plus } from "lucide-react"
import { formatWon } from "@/lib/billing"

interface BillingItem {
  id: number
  name: string
  unit: string | null
  unit_price: string | null
  is_metered: boolean
  default_amount: string | null
  sort_order: number
  is_active: boolean
}

const EMPTY_FORM = {
  name: "",
  unit: "",
  unit_price: "",
  is_metered: false,
  default_amount: "",
  sort_order: "0",
  is_active: true,
}

export function BillingItems() {
  const [items, setItems] = useState<BillingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")

  const fetchItems = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/admin/billing/items", { credentials: "include" })
      const data = await res.json()
      if (data.success) {
        setItems(data.items)
      } else {
        setError(data.error || "목록을 불러오지 못했습니다")
      }
    } catch {
      setError("서버 오류가 발생했습니다")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
  }, [])

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
    setFormError("")
    setFormOpen(true)
  }

  const openEdit = (item: BillingItem) => {
    setEditingId(item.id)
    setForm({
      name: item.name,
      unit: item.unit || "",
      unit_price: item.unit_price === null ? "" : String(Number(item.unit_price)),
      is_metered: item.is_metered,
      default_amount: item.default_amount === null ? "" : String(Number(item.default_amount)),
      sort_order: String(item.sort_order),
      is_active: item.is_active,
    })
    setFormError("")
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError("항목명은 필수입니다")
      return
    }
    if (form.is_metered && !(Number(form.unit_price) > 0)) {
      setFormError("검침 항목은 단가가 필요합니다")
      return
    }
    if (!form.is_metered && form.default_amount === "") {
      setFormError("정액 항목은 기본 금액이 필요합니다")
      return
    }
    setSaving(true)
    setFormError("")
    try {
      const body = {
        ...(editingId ? { id: editingId } : {}),
        name: form.name.trim(),
        unit: form.unit.trim() || null,
        unit_price: form.unit_price === "" ? null : Number(form.unit_price),
        is_metered: form.is_metered,
        default_amount: form.default_amount === "" ? null : Math.round(Number(form.default_amount)),
        sort_order: Number(form.sort_order) || 0,
        is_active: form.is_active,
      }
      const res = await fetch("/api/admin/billing/items", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        setFormOpen(false)
        fetchItems()
      } else {
        setFormError(data.error || "저장에 실패했습니다")
      }
    } catch {
      setFormError("서버 오류가 발생했습니다")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item: BillingItem) => {
    if (!confirm(`'${item.name}' 항목을 삭제할까요? 검침 기록이 있으면 삭제 대신 비활성화를 권장합니다.`)) return
    try {
      const res = await fetch(`/api/admin/billing/items?id=${item.id}`, {
        method: "DELETE",
        credentials: "include",
      })
      const data = await res.json()
      if (data.success) {
        fetchItems()
      } else {
        alert(data.error || "삭제에 실패했습니다")
      }
    } catch {
      alert("서버 오류가 발생했습니다")
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          항목 추가
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      <div className="rounded-lg border border-warm-tan bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>항목명</TableHead>
              <TableHead>유형</TableHead>
              <TableHead className="text-right">단가/정액</TableHead>
              <TableHead>단위</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-text-secondary">
                  불러오는 중...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-text-secondary">
                  항목이 없습니다. 마이그레이션(2026-saas-03-billing.sql)을 실행해주세요.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-dark">{item.name}</TableCell>
                  <TableCell>
                    {item.is_metered ? <Badge>검침</Badge> : <Badge variant="secondary">정액</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.is_metered
                      ? item.unit_price !== null
                        ? `${formatWon(item.unit_price)}원/${item.unit || "-"}`
                        : "-"
                      : item.default_amount !== null
                        ? `${formatWon(item.default_amount)}원`
                        : "-"}
                  </TableCell>
                  <TableCell>{item.unit || "-"}</TableCell>
                  <TableCell>
                    {item.is_active ? (
                      <span className="text-sm text-dark">사용 중</span>
                    ) : (
                      <span className="text-sm text-text-secondary">비활성</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => openEdit(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDelete(item)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "항목 수정" : "항목 추가"}</DialogTitle>
            <DialogDescription>
              검침 항목은 사용량×단가로, 정액 항목은 기본 금액으로 청구됩니다
            </DialogDescription>
          </DialogHeader>

          {formError && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {formError}
            </div>
          )}

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="i-name">항목명 *</Label>
              <Input
                id="i-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={form.is_metered}
                onCheckedChange={(checked) => setForm({ ...form, is_metered: checked === true })}
              />
              <span className="text-sm text-dark">검침 항목 (사용량 × 단가)</span>
            </label>
            {form.is_metered ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="i-unit">단위</Label>
                  <Input
                    id="i-unit"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    placeholder="kWh"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="i-price">단가(원) *</Label>
                  <Input
                    id="i-price"
                    type="number"
                    value={form.unit_price}
                    onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                  />
                </div>
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="i-default">기본 금액(원) *</Label>
                <Input
                  id="i-default"
                  type="number"
                  value={form.default_amount}
                  onChange={(e) => setForm({ ...form, default_amount: e.target.value })}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="i-sort">정렬 순서</Label>
                <Input
                  id="i-sort"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 self-end pb-2">
                <Checkbox
                  checked={form.is_active}
                  onCheckedChange={(checked) => setForm({ ...form, is_active: checked === true })}
                />
                <span className="text-sm text-dark">사용 중</span>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
