"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
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
import { AdminCard } from "@/components/admin/admin-ui"
import { ContentField } from "@/components/admin/content-field"
import { Pencil, Trash2, Plus, Eye, EyeOff } from "lucide-react"
import { COLLECTIONS, SETTINGS, type CollectionDef, type FieldDef } from "@/lib/content-schema"

interface Item {
  id: number
  sort_order: number
  is_active: boolean
  data: Record<string, unknown>
}

function fieldLabel(def: CollectionDef, key: string): string {
  return def.fields.find((x) => x.key === key)?.label ?? key
}

// 저장 직전 정리: stringlist 필드의 빈 줄/공백 제거
function normalizeForm(fields: FieldDef[], form: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...form }
  for (const f of fields) {
    if (f.type === "stringlist" && Array.isArray(out[f.key])) {
      out[f.key] = (out[f.key] as unknown[]).map((s) => String(s).trim()).filter(Boolean)
    }
  }
  return out
}

function displayValue(def: CollectionDef, key: string, data: Record<string, unknown>): string {
  const f = def.fields.find((x) => x.key === key)
  const raw = data[key]
  if (f?.type === "select" && f.options) {
    return f.options.find((o) => o.value === raw)?.label ?? String(raw ?? "")
  }
  if (Array.isArray(raw)) return raw.join(", ")
  return String(raw ?? "")
}

function CollectionEditor({ def }: { def: CollectionDef }) {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/admin/content-items?collection=${def.collection}`, {
        credentials: "include",
      })
      const data = await res.json()
      if (data.success) setItems(data.items)
      else setError(data.error || "불러오지 못했습니다")
    } catch {
      setError("서버 오류가 발생했습니다")
    } finally {
      setLoading(false)
    }
  }, [def.collection])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm({})
    setOpen(true)
  }
  const openEdit = (item: Item) => {
    setEditing(item)
    setForm({ ...item.data })
    setOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // sort_order는 data가 아닌 최상위 컬럼으로 분리해 전송
      const { sort_order, ...rest } = form
      const dataPayload = normalizeForm(def.fields, rest)
      const body = editing
        ? { id: editing.id, data: dataPayload, sort_order: Number.isFinite(Number(sort_order)) ? Number(sort_order) : undefined }
        : { collection: def.collection, data: dataPayload }
      const res = await fetch("/api/admin/content-items", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      })
      const result = await res.json()
      if (result.success) {
        setOpen(false)
        load()
      } else {
        alert(result.error || "저장에 실패했습니다")
      }
    } catch {
      alert("서버 오류가 발생했습니다")
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (item: Item) => {
    await fetch("/api/admin/content-items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id: item.id, is_active: !item.is_active }),
    })
    load()
  }

  const handleDelete = async (item: Item) => {
    if (!confirm("이 항목을 삭제할까요?")) return
    await fetch(`/api/admin/content-items?id=${item.id}`, { method: "DELETE", credentials: "include" })
    load()
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-text-secondary">{def.description}</p>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          항목 추가
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      <AdminCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">순서</TableHead>
              {def.listFields.map((key) => (
                <TableHead key={key}>{fieldLabel(def, key)}</TableHead>
              ))}
              <TableHead className="w-20">표시</TableHead>
              <TableHead className="w-28 text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={def.listFields.length + 3} className="py-10 text-center text-text-secondary">
                  불러오는 중...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={def.listFields.length + 3} className="py-10 text-center text-text-secondary">
                  항목이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id} className={item.is_active ? "" : "opacity-50"}>
                  <TableCell className="text-sm text-text-secondary">{item.sort_order}</TableCell>
                  {def.listFields.map((key) => (
                    <TableCell key={key} className="max-w-64 truncate text-sm">
                      {displayValue(def, key, item.data)}
                    </TableCell>
                  ))}
                  <TableCell>
                    <button onClick={() => toggleActive(item)} title={item.is_active ? "숨기기" : "표시"}>
                      {item.is_active ? (
                        <Eye className="h-4 w-4 text-text-secondary" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-text-tertiary" />
                      )}
                    </button>
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
      </AdminCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {def.label} {editing ? "수정" : "추가"}
            </DialogTitle>
            <DialogDescription>{def.description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {def.fields.map((field: FieldDef) => (
              <ContentField
                key={field.key}
                field={field}
                value={form[field.key]}
                onChange={(v) => setForm((prev) => ({ ...prev, [field.key]: v }))}
              />
            ))}
            {editing && (
              <ContentField
                field={{ key: "sort_order", label: "정렬 순서", type: "number" }}
                value={form.sort_order ?? editing.sort_order}
                onChange={(v) => setForm((prev) => ({ ...prev, sort_order: v }))}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
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

function SettingsEditor({ settingKey, label, fields }: { settingKey: string; label: string; fields: FieldDef[] }) {
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/admin/site-content?key=${settingKey}`, { credentials: "include" })
        const data = await res.json()
        if (data.success && data.value) setForm(data.value)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [settingKey])

  const handleSave = async () => {
    setSaving(true)
    setMessage("")
    try {
      const res = await fetch("/api/admin/site-content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ key: settingKey, value: normalizeForm(fields, form) }),
      })
      const data = await res.json()
      setMessage(data.success ? "저장되었습니다" : data.error || "저장 실패")
    } catch {
      setMessage("서버 오류가 발생했습니다")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="py-6 text-sm text-text-secondary">불러오는 중...</p>

  return (
    <AdminCard className="p-6">
      <h3 className="mb-4 font-semibold text-dark">{label}</h3>
      <div className="grid gap-4">
        {fields.map((field) => (
          <ContentField
            key={field.key}
            field={field}
            value={form[field.key]}
            onChange={(v) => setForm((prev) => ({ ...prev, [field.key]: v }))}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "저장 중..." : "저장"}
        </Button>
        {message && <span className="text-sm text-text-secondary">{message}</span>}
      </div>
    </AdminCard>
  )
}

const TABS = [{ key: "__settings", label: "설정·텍스트" }, ...COLLECTIONS.map((c) => ({ key: c.collection, label: c.label }))]

export function SiteContentManager() {
  const [tab, setTab] = useState("__settings")

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-1 border-b border-warm-tan">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-gold text-dark"
                : "border-transparent text-text-secondary hover:text-dark"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "__settings" ? (
        <div className="grid gap-6">
          {SETTINGS.map((s) => (
            <SettingsEditor key={s.key} settingKey={s.key} label={s.label} fields={s.fields} />
          ))}
        </div>
      ) : (
        <CollectionEditor def={COLLECTIONS.find((c) => c.collection === tab)!} />
      )}
    </div>
  )
}
