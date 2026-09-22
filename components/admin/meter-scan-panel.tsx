"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { HelpNote } from "@/components/admin/admin-ui"
import { Camera, Loader2, X, Check, TriangleAlert } from "lucide-react"
import { METER_LABELS, type MeterCode, type ScanResult } from "@/lib/meter-scan"

// 계량기·한전 고지서 사진을 올려 자동 판독하는 패널.
// 판독 결과는 제안일 뿐이며, 실제 저장은 부모(월 마감 마법사)의 기존 저장 버튼이 담당한다.

const CONFIDENCE_LABEL: Record<"high" | "medium" | "low", string> = {
  high: "확실",
  medium: "보통",
  low: "불확실",
}
const CONFIDENCE_CLASS: Record<"high" | "medium" | "low", string> = {
  high: "bg-green-50 text-green-800 border-green-200",
  medium: "bg-amber-50 text-amber-800 border-amber-200",
  low: "bg-destructive/10 text-destructive border-destructive/30",
}

interface Picked {
  file: File
  url: string
}

export function MeterScanPanel({
  period,
  onApplyReadings,
  onApplyKepco,
}: {
  period: string
  onApplyReadings: (readings: Record<string, string>) => void
  onApplyKepco: (totalAmount: number) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<Picked[]>([])
  const [hint, setHint] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [needsSetup, setNeedsSetup] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [applied, setApplied] = useState(false)

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const next = Array.from(list)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, 8 - picked.length)
      .map((f) => ({ file: f, url: URL.createObjectURL(f) }))
    setPicked((p) => [...p, ...next])
    setResult(null)
    setApplied(false)
    setError("")
  }

  const removeAt = (i: number) => {
    setPicked((p) => {
      URL.revokeObjectURL(p[i].url)
      return p.filter((_, idx) => idx !== i)
    })
    setResult(null)
    setApplied(false)
  }

  const scan = async () => {
    setBusy(true)
    setError("")
    setNeedsSetup(false)
    setResult(null)
    try {
      const fd = new FormData()
      for (const p of picked) fd.append("files", p.file)
      fd.append("hint", hint)
      fd.append("period", period)
      const res = await fetch("/api/admin/billing/meters/scan", {
        method: "POST",
        body: fd,
        credentials: "include",
      })
      const d = await res.json()
      if (d.success) {
        setResult(d.result as ScanResult)
      } else {
        setError(d.error || "판독에 실패했습니다")
        setNeedsSetup(Boolean(d.needs_setup))
      }
    } catch {
      setError("판독 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setBusy(false)
    }
  }

  const applyAll = () => {
    if (!result) return
    const readings: Record<string, string> = {}
    for (const m of result.meters) readings[m.code] = String(m.reading)
    if (Object.keys(readings).length > 0) onApplyReadings(readings)
    if (result.kepco) onApplyKepco(result.kepco.total_amount)
    setApplied(true)
  }

  const lowCount = result?.meters.filter((m) => m.confidence !== "high").length ?? 0

  return (
    <div className="rounded-md border border-gold/40 bg-gold/5 p-4">
      <div className="flex items-center gap-2">
        <Camera className="h-4 w-4 text-gold" />
        <h4 className="text-sm font-semibold text-dark">사진으로 자동 입력</h4>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-text-secondary [word-break:keep-all]">
        계량기 사진과 한전 고지서 사진을 올리면 숫자를 대신 읽어 아래 칸을 채워 줍니다.
        <b className="text-dark"> 판독 결과는 제안일 뿐이므로 반드시 눈으로 확인한 뒤 저장하세요.</b>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files)
            if (fileRef.current) fileRef.current.value = ""
          }}
        />
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy || picked.length >= 8}>
          사진 선택 {picked.length > 0 && `(${picked.length}/8)`}
        </Button>
        <Button size="sm" onClick={scan} disabled={busy || picked.length === 0}>
          {busy ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              판독 중... (20~40초)
            </>
          ) : (
            "판독하기"
          )}
        </Button>
      </div>

      {picked.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {picked.map((p, i) => (
            <div key={p.url} className="relative">
              <Image
                src={p.url}
                alt={`올린 사진 ${i + 1}`}
                width={72}
                height={72}
                unoptimized
                className="h-18 w-18 rounded border border-warm-tan object-cover"
              />
              <span className="absolute left-0 top-0 rounded-br bg-dark/80 px-1 text-[10px] text-white">{i}</span>
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label={`${i + 1}번째 사진 제거`}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-dark p-0.5 text-white hover:bg-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {picked.length > 0 && (
        <div className="mt-3">
          <Input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="힌트 (선택) — 예: 0번은 메인, 1번은 F101, 2번은 냉난방기"
            className="h-8 text-xs"
          />
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
          {needsSetup && (
            <p className="mt-1 text-text-secondary">
              설정 전까지는 아래 칸에 직접 입력하시면 됩니다. 기능은 그대로 동작합니다.
            </p>
          )}
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-md border border-warm-tan bg-card p-3">
          {result.meters.length === 0 && !result.kepco ? (
            <p className="text-xs text-text-secondary">사진에서 읽어낼 수 있는 값이 없었습니다.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-text-secondary">
                <tr>
                  <th className="pb-1.5 text-left font-medium">항목</th>
                  <th className="pb-1.5 text-right font-medium">판독값</th>
                  <th className="pb-1.5 pl-2 text-left font-medium">신뢰도</th>
                  <th className="pb-1.5 pl-2 text-left font-medium">비고</th>
                </tr>
              </thead>
              <tbody>
                {result.meters.map((m) => (
                  <tr key={m.code} className="border-t border-warm-tan/50">
                    <td className="py-1.5 text-dark">{METER_LABELS[m.code as MeterCode] ?? m.code}</td>
                    <td className="py-1.5 text-right font-medium text-dark">{m.reading.toLocaleString("ko-KR")}</td>
                    <td className="py-1.5 pl-2">
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] ${CONFIDENCE_CLASS[m.confidence]}`}>
                        {CONFIDENCE_LABEL[m.confidence]}
                      </span>
                      <span className="ml-1 text-text-tertiary">사진 {m.image_index}</span>
                    </td>
                    <td className="py-1.5 pl-2 text-text-secondary [word-break:keep-all]">{m.note}</td>
                  </tr>
                ))}
                {result.kepco && (
                  <tr className="border-t border-warm-tan/50">
                    <td className="py-1.5 text-dark">한전 청구금액{result.kepco.period && ` (${result.kepco.period})`}</td>
                    <td className="py-1.5 text-right font-medium text-dark">
                      {result.kepco.total_amount.toLocaleString("ko-KR")}원
                    </td>
                    <td className="py-1.5 pl-2">
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] ${CONFIDENCE_CLASS[result.kepco.confidence]}`}>
                        {CONFIDENCE_LABEL[result.kepco.confidence]}
                      </span>
                      <span className="ml-1 text-text-tertiary">사진 {result.kepco.image_index}</span>
                    </td>
                    <td className="py-1.5 pl-2 text-text-secondary [word-break:keep-all]">{result.kepco.note}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {result.warnings.length > 0 && (
            <ul className="mt-2.5 space-y-1 border-t border-warm-tan/50 pt-2">
              {result.warnings.map((w, i) => (
                <li key={i} className="flex gap-1.5 text-xs text-amber-800 [word-break:keep-all]">
                  <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                  {w}
                </li>
              ))}
            </ul>
          )}

          {(result.meters.length > 0 || result.kepco) && (
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" onClick={applyAll} disabled={applied}>
                {applied ? (
                  <>
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                    입력함
                  </>
                ) : (
                  "아래 칸에 채워 넣기"
                )}
              </Button>
              {lowCount > 0 && (
                <span className="text-xs text-amber-800">
                  {lowCount}개 항목은 확실하지 않습니다 — 채운 뒤 꼭 확인하세요
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <HelpNote title="사진은 어떻게 찍어야 잘 읽히나요?">
        <ul className="list-disc space-y-0.5 pl-4">
          <li>계량기 숫자판이 화면을 가득 채우도록, 정면에서 찍으세요. 비스듬하면 자릿수를 놓칩니다.</li>
          <li>계량기 이름표(F101 · 동력 · 냉난방 등)가 같이 나오면 어느 계량기인지 자동으로 구분합니다. 안 나오면 위 힌트 칸에 순서를 적어 주세요.</li>
          <li>기계식 계량기의 <b>빨간색 마지막 자리(소수점)는 빼고</b> 읽습니다.</li>
          <li>한전 고지서는 <b>청구금액</b>이 보이게 찍으세요. 사용량(kWh)이 아니라 최종 금액을 읽습니다.</li>
          <li>한 번에 8장까지, 계량기 4개 + 고지서 1장이면 충분합니다.</li>
          <li>올린 원본 사진은 근거로 보관되며, 나중에 정산 검증에 쓸 수 있습니다.</li>
        </ul>
      </HelpNote>
    </div>
  )
}
