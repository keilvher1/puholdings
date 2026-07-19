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
import { Copy, Check, KeyRound, Pencil, Trash2, Plus } from "lucide-react"

interface Tenant {
  id: number
  name: string
  business_no: string | null
  ceo_name: string | null
  room_no: string | null
  contact_email: string | null
  contact_phone: string | null
  move_in_date: string | null
  move_out_date: string | null
  status: "active" | "moved_out"
  memo: string | null
  account_id: number | null
  account_email: string | null
  account_last_login: string | null
}

const EMPTY_FORM = {
  name: "",
  business_no: "",
  ceo_name: "",
  room_no: "",
  contact_email: "",
  contact_phone: "",
  move_in_date: "",
  move_out_date: "",
  status: "active",
  memo: "",
}

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : ""
}

export function TenantsManager() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("all")
  const [error, setError] = useState("")

  // 등록/수정 Dialog
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")

  // 계정 발급 Dialog
  const [accountOpen, setAccountOpen] = useState(false)
  const [accountTenant, setAccountTenant] = useState<Tenant | null>(null)
  const [accountEmail, setAccountEmail] = useState("")
  const [accountName, setAccountName] = useState("")
  const [issuing, setIssuing] = useState(false)
  const [accountError, setAccountError] = useState("")
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchTenants = useCallback(async (status: string) => {
    setLoading(true)
    setError("")
    try {
      const qs = status === "all" ? "" : `?status=${status}`
      const res = await fetch(`/api/admin/tenants${qs}`, { credentials: "include" })
      const data = await res.json()
      if (data.success) {
        setTenants(data.tenants)
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
    fetchTenants(statusFilter)
  }, [fetchTenants, statusFilter])

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
    setFormError("")
    setFormOpen(true)
  }

  const openEdit = (t: Tenant) => {
    setEditingId(t.id)
    setForm({
      name: t.name,
      business_no: t.business_no || "",
      ceo_name: t.ceo_name || "",
      room_no: t.room_no || "",
      contact_email: t.contact_email || "",
      contact_phone: t.contact_phone || "",
      move_in_date: toDateInput(t.move_in_date),
      move_out_date: toDateInput(t.move_out_date),
      status: t.status,
      memo: t.memo || "",
    })
    setFormError("")
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError("기업명은 필수입니다")
      return
    }
    setSaving(true)
    setFormError("")
    try {
      const res = await fetch("/api/admin/tenants", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(editingId ? { id: editingId, ...form } : form),
      })
      const data = await res.json()
      if (data.success) {
        setFormOpen(false)
        fetchTenants(statusFilter)
      } else {
        setFormError(data.error || "저장에 실패했습니다")
      }
    } catch {
      setFormError("서버 오류가 발생했습니다")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (t: Tenant) => {
    if (!confirm(`'${t.name}'을(를) 삭제할까요? 발급된 포털 계정도 함께 삭제됩니다.`)) return
    try {
      const res = await fetch(`/api/admin/tenants?id=${t.id}`, {
        method: "DELETE",
        credentials: "include",
      })
      const data = await res.json()
      if (data.success) {
        fetchTenants(statusFilter)
      } else {
        alert(data.error || "삭제에 실패했습니다")
      }
    } catch {
      alert("서버 오류가 발생했습니다")
    }
  }

  const openAccount = (t: Tenant) => {
    setAccountTenant(t)
    setAccountEmail(t.account_email || t.contact_email || "")
    setAccountName(t.ceo_name || "")
    setAccountError("")
    setIssued(null)
    setCopied(false)
    setAccountOpen(true)
  }

  const handleIssue = async () => {
    if (!accountTenant) return
    setIssuing(true)
    setAccountError("")
    try {
      const res = await fetch(`/api/admin/tenants/${accountTenant.id}/account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: accountEmail, name: accountName }),
      })
      const data = await res.json()
      if (data.success) {
        setIssued({ email: data.email, password: data.temp_password })
        fetchTenants(statusFilter)
      } else {
        setAccountError(data.error || "계정 발급에 실패했습니다")
      }
    } catch {
      setAccountError("서버 오류가 발생했습니다")
    } finally {
      setIssuing(false)
    }
  }

  const handleCopy = async () => {
    if (!issued) return
    await navigator.clipboard.writeText(`이메일: ${issued.email}\n임시 비밀번호: ${issued.password}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="active">입주 중</SelectItem>
            <SelectItem value="moved_out">퇴거</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          기업 등록
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      <div className="rounded-lg border border-warm-tan bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>기업명</TableHead>
              <TableHead>대표</TableHead>
              <TableHead>호실</TableHead>
              <TableHead>연락처</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>포털 계정</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-text-secondary">
                  불러오는 중...
                </TableCell>
              </TableRow>
            ) : tenants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-text-secondary">
                  등록된 기업이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              tenants.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium text-dark">{t.name}</div>
                    {t.business_no && (
                      <div className="text-xs text-text-secondary">{t.business_no}</div>
                    )}
                  </TableCell>
                  <TableCell>{t.ceo_name || "-"}</TableCell>
                  <TableCell>{t.room_no || "-"}</TableCell>
                  <TableCell>
                    <div className="text-sm">{t.contact_phone || "-"}</div>
                    {t.contact_email && (
                      <div className="text-xs text-text-secondary">{t.contact_email}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {t.status === "active" ? (
                      <Badge>입주 중</Badge>
                    ) : (
                      <Badge variant="secondary">퇴거</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {t.account_id ? (
                      <div className="text-sm">{t.account_email}</div>
                    ) : (
                      <span className="text-sm text-text-secondary">미발급</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => openAccount(t)}>
                        <KeyRound className="h-3.5 w-3.5" />
                        {t.account_id ? "비밀번호 초기화" : "계정 발급"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDelete(t)}>
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

      {/* 등록/수정 Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "기업 정보 수정" : "기업 등록"}</DialogTitle>
            <DialogDescription>
              {editingId ? "입주기업 정보를 수정합니다" : "새 입주기업을 등록합니다"}
            </DialogDescription>
          </DialogHeader>

          {formError && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{formError}</div>
          )}

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="t-name">기업명 *</Label>
              <Input
                id="t-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="t-business-no">사업자번호</Label>
                <Input
                  id="t-business-no"
                  value={form.business_no}
                  onChange={(e) => setForm({ ...form, business_no: e.target.value })}
                  placeholder="000-00-00000"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="t-ceo">대표자</Label>
                <Input
                  id="t-ceo"
                  value={form.ceo_name}
                  onChange={(e) => setForm({ ...form, ceo_name: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="t-room">호실</Label>
                <Input
                  id="t-room"
                  value={form.room_no}
                  onChange={(e) => setForm({ ...form, room_no: e.target.value })}
                  placeholder="301호"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="t-status">상태</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v })}
                >
                  <SelectTrigger id="t-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">입주 중</SelectItem>
                    <SelectItem value="moved_out">퇴거</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="t-email">담당자 이메일</Label>
                <Input
                  id="t-email"
                  type="email"
                  value={form.contact_email}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="t-phone">연락처</Label>
                <Input
                  id="t-phone"
                  value={form.contact_phone}
                  onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                  placeholder="054-000-0000"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="t-move-in">입주일</Label>
                <Input
                  id="t-move-in"
                  type="date"
                  value={form.move_in_date}
                  onChange={(e) => setForm({ ...form, move_in_date: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="t-move-out">퇴거일</Label>
                <Input
                  id="t-move-out"
                  type="date"
                  value={form.move_out_date}
                  onChange={(e) => setForm({ ...form, move_out_date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="t-memo">메모</Label>
              <Textarea
                id="t-memo"
                rows={3}
                value={form.memo}
                onChange={(e) => setForm({ ...form, memo: e.target.value })}
              />
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

      {/* 계정 발급 Dialog */}
      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {accountTenant?.account_id ? "비밀번호 초기화" : "포털 계정 발급"}
            </DialogTitle>
            <DialogDescription>
              {accountTenant?.name}의 입주기업 포털 계정
              {accountTenant?.account_id
                ? " 비밀번호를 초기화합니다. 기존 비밀번호는 사용할 수 없게 됩니다."
                : "을 발급합니다."}
            </DialogDescription>
          </DialogHeader>

          {issued ? (
            <div className="grid gap-3">
              <div className="rounded-md bg-warm-beige px-4 py-3 text-sm">
                <p className="mb-2 font-medium text-dark">
                  임시 비밀번호가 발급되었습니다. 이 창을 닫으면 다시 확인할 수 없으니 지금 전달하세요.
                </p>
                <p>
                  이메일: <span className="font-mono">{issued.email}</span>
                </p>
                <p>
                  임시 비밀번호: <span className="font-mono font-bold">{issued.password}</span>
                </p>
              </div>
              <Button variant="outline" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "복사됨" : "이메일·비밀번호 복사"}
              </Button>
              <p className="text-xs text-text-secondary">
                입주기업이 처음 로그인하면 비밀번호 변경이 강제됩니다.
              </p>
            </div>
          ) : (
            <>
              {accountError && (
                <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {accountError}
                </div>
              )}
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="a-email">로그인 이메일 *</Label>
                  <Input
                    id="a-email"
                    type="email"
                    value={accountEmail}
                    onChange={(e) => setAccountEmail(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="a-name">담당자 이름</Label>
                  <Input
                    id="a-name"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <DialogFooter>
            {issued ? (
              <Button onClick={() => setAccountOpen(false)}>닫기</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setAccountOpen(false)} disabled={issuing}>
                  취소
                </Button>
                <Button onClick={handleIssue} disabled={issuing || !accountEmail}>
                  {issuing
                    ? "발급 중..."
                    : accountTenant?.account_id
                      ? "비밀번호 초기화"
                      : "계정 발급"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
