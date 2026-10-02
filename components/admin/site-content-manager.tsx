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
import { BusyButton, EmptyState, Notice, toastSuccess, useConfirm } from "@/components/saas"
import { friendlyError, MSG } from "@/lib/messages"
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

// 목록·확인창에 쓸 항목 이름(첫 목록 필드 값)
function itemName(def: CollectionDef, item: Item): string {
  const key = def.listFields[0]
  const v = key ? displayValue(def, key, item.data).trim() : ""
  return v || "이 항목"
}

function CollectionEditor({ def }: { def: CollectionDef }) {
  const ask = useConfirm()
  const [formError, setFormError] = useState("")
  const [actionError, setActionError] = useState("")
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
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) setItems(data.items)
      else setError(friendlyError(res.status, data.error, MSG.loadFailed))
    } catch {
      setError(friendlyError(0, null, MSG.loadFailed))
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
    setFormError("")
    setOpen(true)
  }
  const openEdit = (item: Item) => {
    setEditing(item)
    setForm({ ...item.data })
    setFormError("")
    setOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setFormError("")
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
      const result = await res.json().catch(() => ({}))
      if (res.ok && result.success) {
        setOpen(false)
        toastSuccess(editing ? `${def.label} 항목을 저장했어요` : `${def.label} 항목을 추가했어요`)
        load()
      } else {
        setFormError(friendlyError(res.status, result.error, MSG.saveFailed))
      }
    } catch {
      setFormError(friendlyError(0, null, MSG.saveFailed))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (item: Item) => {
    setActionError("")
    try {
      const res = await fetch("/api/admin/content-items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: item.id, is_active: !item.is_active }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) setActionError(friendlyError(res.status, data.error, MSG.saveFailed))
    } catch {
      setActionError(friendlyError(0, null, MSG.saveFailed))
    }
    load()
  }

  const handleDelete = async (item: Item) => {
    const name = itemName(def, item)
    if (
      !(await ask({
        title: `‘${name}’ 항목을 삭제할까요?`,
        consequences: ["홈페이지에서 바로 사라져요", "되돌릴 수 없어요"],
        confirmLabel: "삭제하기",
        tone: "danger",
      }))
    )
      return
    setActionError("")
    try {
      const res = await fetch(`/api/admin/content-items?id=${item.id}`, { method: "DELETE", credentials: "include" })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success !== false) toastSuccess(`‘${name}’ 항목을 삭제했어요`)
      else setActionError(friendlyError(res.status, data.error, MSG.deleteFailed))
    } catch {
      setActionError(friendlyError(0, null, MSG.deleteFailed))
    }
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

      {actionError && (
        <Notice tone="danger" className="mb-4" onClose={() => setActionError("")}>
          {actionError}
        </Notice>
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
                  {MSG.busyLoad}
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={def.listFields.length + 3}>
                  <EmptyState kind="error" compact title={`${def.label} 목록을 불러오지 못했어요`} description={error} onRetry={load} />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={def.listFields.length + 3} className="py-10 text-center text-text-secondary">
                  아직 항목이 없어요
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
                    <button
                      type="button"
                      onClick={() => toggleActive(item)}
                      title={item.is_active ? "숨기기" : "표시하기"}
                      aria-label={`${itemName(def, item)} ${item.is_active ? "숨기기" : "표시하기"}`}
                      aria-pressed={item.is_active}
                      className="inline-flex size-8 items-center justify-center rounded-md hover:bg-warm-beige"
                    >
                      {item.is_active ? (
                        <Eye className="h-4 w-4 text-[#3f3f4e]" aria-hidden />
                      ) : (
                        <EyeOff className="h-4 w-4 text-text-secondary" aria-hidden />
                      )}
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="icon-sm" onClick={() => openEdit(item)} aria-label={`${itemName(def, item)} 수정`} title="수정" className="hover:bg-warm-beige hover:text-dark">
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button variant="outline" size="icon-sm" onClick={() => handleDelete(item)} aria-label={`${itemName(def, item)} 삭제`} title="삭제" className="hover:bg-red-50 hover:text-red-800">
                        <Trash2 className="size-4" aria-hidden />
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
          {formError && <Notice tone="danger">{formError}</Notice>}
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
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving} className="hover:bg-warm-beige hover:text-dark">
              닫기
            </Button>
            <BusyButton busy={saving} onClick={handleSave}>
              {editing ? "저장하기" : "추가하기"}
            </BusyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SettingsEditor({ settingKey, label, fields }: { settingKey: string; label: string; fields: FieldDef[] }) {
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")

  // 불러오기에 실패하면 빈 폼을 보여 주지 않는다(빈 값으로 저장해 덮어쓰는 일을 막는다)
  const load = useCallback(async () => {
    setLoading(true)
    setLoadError("")
    try {
      const res = await fetch(`/api/admin/site-content?key=${settingKey}`, { credentials: "include" })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        if (data.value) setForm(data.value)
      } else setLoadError(friendlyError(res.status, data.error, MSG.loadFailed))
    } catch {
      setLoadError(friendlyError(0, null, MSG.loadFailed))
    } finally {
      setLoading(false)
    }
  }, [settingKey])

  useEffect(() => {
    void load()
  }, [load])

  const handleSave = async () => {
    setSaving(true)
    setSaveError("")
    try {
      const res = await fetch("/api/admin/site-content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ key: settingKey, value: normalizeForm(fields, form) }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) toastSuccess(`${label} 내용을 저장했어요`)
      else setSaveError(friendlyError(res.status, data.error, MSG.saveFailed))
    } catch {
      setSaveError(friendlyError(0, null, MSG.saveFailed))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="py-6 text-sm text-text-secondary">{MSG.busyLoad}</p>
  if (loadError)
    return <EmptyState kind="error" bordered compact title={`${label} 내용을 불러오지 못했어요`} description={loadError} onRetry={() => void load()} />

  return (
    <AdminCard className="p-6">
      <h3 className="mb-4 font-semibold text-dark">{label}</h3>
      {saveError && (
        <Notice tone="danger" className="mb-4">
          {saveError}
        </Notice>
      )}
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
        <BusyButton busy={saving} onClick={handleSave}>
          {label} 저장하기
        </BusyButton>
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
