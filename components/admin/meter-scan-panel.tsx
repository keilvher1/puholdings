"use client"

// 계량기·한전 고지서 사진을 올려 숫자를 자동 인식하는 패널(월 마감 1단계 [사진으로 채우기] 안).
// 자동 인식 결과는 제안일 뿐이다. [칸에 채우기]는 화면 칸만 채우고, 저장은 사람이 [검침 저장]을 눌러야 한다(CLAUDE.md 9항).
// 인식이 설정되지 않았으면 부모(서버의 isMeterScanEnabled())가 이 패널을 그리지 않고 "직접 입력해 주세요"를 먼저 보인다.
// 사진 번호는 1부터 센다(서버 응답 image_index는 0부터라 +1 해서 보인다).

import { useRef, useState } from "react"
import Image from "next/image"
import { Check, Loader2, TriangleAlert, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Notice, ToneBadge } from "@/components/saas"
import { num, won } from "@/lib/format"
import { friendlyError } from "@/lib/messages"
import { METER_LABELS, type MeterCode, type ScanResult } from "@/lib/meter-scan"

const CONFIDENCE: Record<"high" | "medium" | "low", { label: string; tone: "neutral" | "warning" }> = {
  high: { label: "확실", tone: "neutral" },
  medium: { label: "보통", tone: "warning" },
  low: { label: "불확실", tone: "warning" },
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
      // 화면의 사진 번호는 1부터다. 힌트 속 번호만 1부터라고 알리고, 응답 image_index는 스키마대로 0부터 세라고 못 박는다
      // (그렇지 않으면 모델이 image_index를 1부터 돌려줘 화면 +1과 겹쳐 번호가 하나 밀릴 수 있다).
      fd.append(
        "hint",
        hint.trim() ? `힌트 속 사진 번호는 사람이 1부터 센 번호다(1번 = 첫 번째 사진 = image_index 0). 응답의 image_index는 그대로 0부터 센다. ${hint.trim()}` : "",
      )
      fd.append("period", period)
      const res = await fetch("/api/admin/billing/meters/scan", { method: "POST", body: fd, credentials: "include" })
      const d = await res.json().catch(() => null)
      if (res.ok && d?.success) {
        setResult(d.result as ScanResult)
      } else if (d?.needs_setup) {
        setNeedsSetup(true)
        setError("자동 인식이 설정되지 않았어요. 아래 표에 직접 입력하면 돼요.")
      } else {
        setError(friendlyError(res.status, d?.error, "사진을 읽지 못했어요."))
      }
    } catch {
      setError(friendlyError(0, null, "사진을 읽지 못했어요."))
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

  const lowCount = (result?.meters.filter((m) => m.confidence !== "high").length ?? 0) + (result?.kepco && result.kepco.confidence !== "high" ? 1 : 0)

  return (
    <div>
      <p className="text-[15px] leading-relaxed text-[#3f3f4e] [word-break:keep-all]">
        계량기 사진과 한전 고지서 사진을 올리면 숫자를 읽어 칸을 채워요. 자동 인식 결과는 제안이에요. 숫자를 확인한 뒤 저장은 직접 눌러야 해요.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          aria-label="계량기·고지서 사진 고르기"
          onChange={(e) => {
            addFiles(e.target.files)
            if (fileRef.current) fileRef.current.value = ""
          }}
        />
        <Button type="button" variant="outline" size="sm" className="hover:bg-warm-beige hover:text-dark" onClick={() => fileRef.current?.click()} disabled={busy || picked.length >= 8}>
          사진 고르기{picked.length > 0 && ` (8장 중 ${picked.length}장)`}
        </Button>
        <Button type="button" size="sm" onClick={scan} disabled={busy || picked.length === 0} aria-busy={busy || undefined}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              읽는 중… (20~40초)
            </>
          ) : (
            "사진 읽기"
          )}
        </Button>
      </div>

      {picked.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-3" aria-label="올린 사진">
          {picked.map((p, i) => (
            <li key={p.url} className="relative">
              <Image src={p.url} alt={`올린 사진 ${i + 1}번`} width={72} height={72} unoptimized className="h-18 w-18 rounded border border-warm-tan object-cover" />
              <span className="absolute left-0 top-0 rounded-br bg-dark px-1.5 text-xs font-medium text-white">{i + 1}</span>
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label={`사진 ${i + 1}번 빼기`}
                className="absolute -right-2 -top-2 inline-flex size-7 items-center justify-center rounded-full bg-dark text-white hover:bg-red-800"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {picked.length > 0 && (
        <div className="mt-3 grid gap-1.5">
          <Label htmlFor="meter-scan-hint" className="text-[15px]">
            사진 순서 힌트(선택)
          </Label>
          <Input id="meter-scan-hint" value={hint} onChange={(e) => setHint(e.target.value)} placeholder="예: 1번은 공장동 전체, 2번은 F101, 3번은 냉난방기" className="text-base" />
        </div>
      )}

      {error && (
        <Notice tone={needsSetup ? "info" : "danger"} title={needsSetup ? undefined : "사진을 읽지 못했어요"} className="mt-3">
          {error}
          {!needsSetup && <p className="mt-1">아래 표에 직접 입력해도 돼요.</p>}
        </Notice>
      )}

      {result && (
        <div className="mt-3 rounded-md border border-warm-tan bg-card p-3">
          {result.meters.length === 0 && !result.kepco ? (
            <p className="text-[15px] text-[#3f3f4e]">사진에서 읽은 값이 없어요. 사진을 다시 찍거나 직접 입력해 주세요.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-[15px]">
                <caption className="sr-only">자동 인식 결과</caption>
                <thead className="text-left text-sm text-[#3f3f4e]">
                  <tr>
                    <th scope="col" className="pb-1.5 font-medium">항목</th>
                    <th scope="col" className="pb-1.5 text-right font-medium">읽은 값</th>
                    <th scope="col" className="pb-1.5 pl-3 font-medium">확신</th>
                    <th scope="col" className="pb-1.5 pl-3 font-medium">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {result.meters.map((m) => (
                    <tr key={m.code} className="border-t border-warm-tan/60 align-top">
                      <th scope="row" className="py-1.5 text-left font-normal text-dark">{METER_LABELS[m.code as MeterCode] ?? m.code}</th>
                      <td className="py-1.5 text-right font-medium tabular-nums text-dark">{num(m.reading)}</td>
                      <td className="py-1.5 pl-3">
                        <ToneBadge tone={CONFIDENCE[m.confidence].tone} icon={false}>
                          {CONFIDENCE[m.confidence].label}
                        </ToneBadge>
                        <span className="ml-1 text-sm text-[#3f3f4e]">사진 {m.image_index + 1}번</span>
                      </td>
                      <td className="py-1.5 pl-3 text-sm text-[#3f3f4e] [word-break:keep-all]">{m.note}</td>
                    </tr>
                  ))}
                  {result.kepco && (
                    <tr className="border-t border-warm-tan/60 align-top">
                      <th scope="row" className="py-1.5 text-left font-normal text-dark">한전 청구금액{result.kepco.period && ` (${result.kepco.period})`}</th>
                      <td className="py-1.5 text-right font-medium tabular-nums text-dark">{won(result.kepco.total_amount)}</td>
                      <td className="py-1.5 pl-3">
                        <ToneBadge tone={CONFIDENCE[result.kepco.confidence].tone} icon={false}>
                          {CONFIDENCE[result.kepco.confidence].label}
                        </ToneBadge>
                        <span className="ml-1 text-sm text-[#3f3f4e]">사진 {result.kepco.image_index + 1}번</span>
                      </td>
                      <td className="py-1.5 pl-3 text-sm text-[#3f3f4e] [word-break:keep-all]">{result.kepco.note}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {result.warnings.length > 0 && (
            <ul className="mt-2.5 space-y-1 border-t border-warm-tan/60 pt-2">
              {result.warnings.map((w, i) => (
                <li key={i} className="flex gap-1.5 text-[15px] text-amber-800 [word-break:keep-all]">
                  <TriangleAlert className="mt-1 size-3.5 shrink-0" aria-hidden />
                  {w}
                </li>
              ))}
            </ul>
          )}

          {(result.meters.length > 0 || result.kepco) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={applyAll} disabled={applied}>
                {applied ? (
                  <>
                    <Check className="size-4" aria-hidden />
                    칸에 채웠어요
                  </>
                ) : (
                  "칸에 채우기"
                )}
              </Button>
              {lowCount > 0 && <span className="text-[15px] text-amber-800">{lowCount}개 항목은 확실하지 않아요. 채운 뒤 꼭 확인해 주세요</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
