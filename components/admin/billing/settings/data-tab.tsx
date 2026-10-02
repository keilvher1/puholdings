"use client"

// 기준 정보 > 가져오기·내보내기 — 매월 쓰는 "월별 정산표 내려받기(작성 중 포함)"를 위에, 처음 설정할 때만 쓰는
// "기존 정산 엑셀 가져오기"는 아래에 경고와 함께 둔다. 반영은 브라우저 확인 창 대신 useConfirm(건수 요약)으로 묻는다(계획서 4.3.9).

import { useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Download, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { BusyButton, MonthPicker, Notice, ResultCard, Section, useConfirm } from "@/components/saas"
import { billMonth, thisMonthKST } from "@/lib/format"
import { MSG, friendlyError } from "@/lib/messages"
import { billingSettingsHref } from "@/lib/links"
import { sendJson } from "./types"
import { importCounts, type ImportPreview } from "./import-counts"

export function DataTab({ defaultExportMonth }: { defaultExportMonth?: string }) {
  const router = useRouter()
  const ask = useConfirm()
  const fileId = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [exportMonth, setExportMonth] = useState(defaultExportMonth ?? thisMonthKST())
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [reading, setReading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ tenants: number; contracts: number; rooms: number } | null>(null)

  const upload = async (file: File) => {
    setReading(true)
    setError(null)
    setResult(null)
    setPreview(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/admin/billing/import-master", { method: "POST", credentials: "include", body: fd })
      let d: (ImportPreview & { success?: boolean; error?: string }) | null = null
      try {
        d = await res.json()
      } catch {
        d = null
      }
      if (!res.ok || !d?.success) setError(friendlyError(res.status, d?.error, "엑셀 파일을 읽지 못했어요."))
      else setPreview({ tenants: d.tenants, vacant_rooms: d.vacant_rooms, warnings: d.warnings ?? [], summary: d.summary })
    } catch {
      setError(friendlyError(0, null, "엑셀 파일을 읽지 못했어요."))
    } finally {
      setReading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const apply = async () => {
    if (!preview || applying) return
    const n = importCounts(preview)
    const ok = await ask({
      // 숫자마다 단위를 붙여 조사("를")가 숫자에 따라 틀리지 않게 한다
      title: `기업 ${n.tenants}곳 · 계약 ${n.contracts}건 · 호실 ${n.rooms}개를 반영할까요?`,
      body: "미리보기 내용을 실제 기업·계약·호실로 저장해요.",
      summary: [
        { label: "기업", value: `${n.tenants}곳(새로 등록 ${n.newTenants} · 이미 있음 ${n.matched})` },
        { label: "계약", value: `${n.contracts}건` },
        { label: "호실", value: `${n.rooms}개(없는 호실만 새로 만들어요)` },
      ],
      consequences: [
        "이름이 같은 기업은 새로 만들지 않고 비어 있는 칸만 채워요",
        "같은 기업·호실의 진행 중 계약이 이미 있으면 건너뛰어요",
        "반영한 뒤에는 이 화면에서 되돌릴 수 없어요",
      ],
      confirmLabel: `기업 ${n.tenants}곳·계약 ${n.contracts}건 반영하기`,
      tone: "danger",
    })
    if (!ok) return
    setApplying(true)
    setError(null)
    try {
      const r = await sendJson<{ tenants_created: number; contracts_created: number; rooms_created: number }>(
        "/api/admin/billing/import-master/confirm",
        "POST",
        { tenants: preview.tenants, vacant_rooms: preview.vacant_rooms },
      )
      if (!r.ok || !r.data) {
        // 일부가 이미 저장됐을 수 있어 같은 버튼을 다시 누르게 하지 않는다 — 계약 탭에서 결과를 확인하게 안내
        setError(
          r.status === 401 || r.status === 403
            ? friendlyError(r.status, r.error, MSG.saveFailed)
            : "반영하지 못했어요. 일부가 이미 저장됐을 수 있어요. 계약·호실 탭에서 확인한 뒤, 필요하면 파일을 다시 올려 주세요.",
        )
        setPreview(null)
        return
      }
      setResult({ tenants: r.data.tenants_created, contracts: r.data.contracts_created, rooms: r.data.rooms_created })
      setPreview(null)
      router.refresh()
    } finally {
      setApplying(false)
    }
  }

  const n = preview ? importCounts(preview) : null

  return (
    <div className="grid gap-5">
      <Section
        title="월별 정산표 내려받기(작성 중 포함)"
        description="고른 청구월의 청구서를 원본 정산표 열 구성의 엑셀로 내려받아요. 아직 발행하지 않은 작성 중 청구서도 들어가요."
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <span className="text-base font-medium text-dark" aria-hidden>
              청구월
            </span>
            <MonthPicker label="청구월" value={exportMonth} onChange={setExportMonth} format={(ym) => billMonth(ym)} />
          </div>
          <Button asChild variant="outline" className="hover:bg-warm-beige">
            <a href={`/api/admin/billing/export?period=${exportMonth}`} download>
              <Download aria-hidden />
              {billMonth(exportMonth)} 정산표 내려받기
            </a>
          </Button>
        </div>
      </Section>

      <Section title="기존 정산 엑셀 가져오기(처음 설정할 때만)" description="예전에 쓰던 정산 엑셀(xlsx)에서 기업·계약·호실을 읽어 한 번에 등록해요.">
        <Notice tone="warning" title="처음 설정할 때만 써요">
          이미 쓰고 있는 기업·계약이 있으면 겹치거나 단가가 다르게 들어갈 수 있어요. 올리면 먼저 미리보기만 보여 주고, [반영하기]를 눌러야 저장돼요.
        </Notice>

        {result && (
          <ResultCard
            title="반영했어요"
            rows={[
              { label: "새로 등록한 기업", value: `${result.tenants}곳` },
              { label: "새로 만든 계약", value: `${result.contracts}건` },
              { label: "새로 만든 호실", value: `${result.rooms}개` },
            ]}
            notes={["이미 있던 기업·계약은 세지 않았어요."]}
            nextSteps={[{ label: "계약 탭에서 단가 확인하기", href: billingSettingsHref({ tab: "contracts" }) }]}
          />
        )}
        {error && (
          <div className="mt-4">
            <Notice tone="danger" title="가져오지 못했어요">
              {error}
            </Notice>
          </div>
        )}

        <div className="mt-4 grid gap-1.5">
          <Label htmlFor={fileId} className="text-base">
            정산 엑셀 파일(xlsx, 10MB까지)
          </Label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              id={fileId}
              type="file"
              accept=".xlsx,.xls"
              disabled={reading || applying}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  setFileName(f.name)
                  void upload(f)
                }
              }}
              className="peer sr-only"
            />
            <label
              htmlFor={fileId}
              aria-hidden
              className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-warm-tan bg-card px-3 text-[15px] font-medium text-dark hover:bg-warm-beige peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-dark peer-disabled:cursor-not-allowed peer-disabled:opacity-60"
            >
              <Upload className="size-4" aria-hidden />
              엑셀 파일 고르기
            </label>
            <span className="min-w-0 break-all text-[15px] text-text-secondary">{fileName ?? "아직 고른 파일이 없어요"}</span>
          </div>
          {reading && <p className="text-sm text-text-secondary" role="status">파일을 읽는 중…</p>}
        </div>

        {preview && n && (
          <div className="mt-5 grid gap-3">
            <p className="text-base text-dark">
              기업 <strong className="tabular-nums">{n.tenants}</strong>곳(이미 있음 {n.matched}) · 계약 <strong className="tabular-nums">{n.contracts}</strong>건 · 호실{" "}
              <strong className="tabular-nums">{n.rooms}</strong>개(공실 {preview.summary.vacant})
            </p>
            {preview.warnings.length > 0 && (
              <Notice tone="warning" title={`확인할 내용 ${preview.warnings.length}개`}>
                <ul className="list-disc space-y-0.5 pl-5">
                  {preview.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </Notice>
            )}
            <div className="max-h-72 overflow-y-auto rounded-md border border-warm-tan">
              <ul className="divide-y divide-warm-tan/70 text-[15px]">
                {preview.tenants.map((t, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 px-3 py-2">
                    <span className="text-dark">
                      {t.name}
                      <span className="ml-1.5 text-sm text-text-secondary">{t.matched_tenant_id ? "이미 있음" : "새로 등록"}</span>
                    </span>
                    <span className="text-text-secondary">{t.contracts.map((c) => c.room_code).join(", ") || "-"}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" className="hover:bg-warm-beige" onClick={() => setPreview(null)} disabled={applying}>
                미리보기 지우기
              </Button>
              <BusyButton type="button" busy={applying} busyLabel="반영 중…" onClick={apply}>
                반영하기
              </BusyButton>
            </div>
          </div>
        )}
      </Section>
    </div>
  )
}
