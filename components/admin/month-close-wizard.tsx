"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AdminCard } from "@/components/admin/admin-ui"
import { formatWon } from "@/lib/billing"

// 사용월(elecMonth) 기준 마법사. 청구월 = 사용월 + 1.
function nextMonth(period: string): string {
  const [y, m] = period.split("-").map(Number)
  const d = new Date(Date.UTC(y, m, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}
function thisMonthPeriod(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`
}
const monthLabel = (p: string) => `${Number(p.slice(5, 7))}월`

interface Meter { id: number; name: string; code: string; curr_reading: number | null; prev_reading: number | null; usage: number | null }
interface Factory { F101: number; F102: number; F103: number; totalA: number }
interface Allocation { areaShare: number; per10Calc: number; per10Suggested: number; per10Billed: number; officeB: number; centerC: number; checkOk: boolean }

export function MonthCloseWizard() {
  const [elecMonth, setElecMonth] = useState(thisMonthPeriod())
  const billMonth = nextMonth(elecMonth)
  const [step, setStep] = useState(1)

  const [meters, setMeters] = useState<Meter[]>([])
  const [meterInput, setMeterInput] = useState<Record<string, string>>({})
  const [factory, setFactory] = useState<Factory | null>(null)

  const [elecTotal, setElecTotal] = useState("")
  const [unitPrice, setUnitPrice] = useState("102")
  const [areaRatio, setAreaRatio] = useState("0.70")
  const [per10, setPer10] = useState("")
  const [alloc, setAlloc] = useState<Allocation | null>(null)
  const [pyeongSum, setPyeongSum] = useState(0)

  const [genResult, setGenResult] = useState<{ created: number; regenerated: number; skipped: { tenant_name: string; reason: string }[] } | null>(null)
  const [issueResult, setIssueResult] = useState<{ issued: number; mail: { sent: number; failed: number }; no_email: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")

  const loadMeters = useCallback(async (p: string) => {
    const res = await fetch(`/api/admin/billing/meters?period=${p}`, { credentials: "include" })
    const d = await res.json()
    if (d.success) {
      setMeters(d.meters)
      setFactory(d.factory)
      setUnitPrice(String(d.unit_price ?? 102))
      const mi: Record<string, string> = {}
      for (const m of d.meters as Meter[]) mi[m.code] = m.curr_reading != null ? String(m.curr_reading) : ""
      setMeterInput(mi)
    }
  }, [])

  const loadPeriod = useCallback(async (p: string) => {
    const res = await fetch(`/api/admin/billing/periods?period=${p}`, { credentials: "include" })
    const d = await res.json()
    if (d.success) {
      setAlloc(d.allocation)
      setFactory(d.factory)
      setPyeongSum(Number(d.pyeong_sum_area || 0))
      if (d.period) {
        if (d.period.elec_total != null) setElecTotal(String(d.period.elec_total))
        if (d.period.elec_unit_price != null) setUnitPrice(String(d.period.elec_unit_price))
        if (d.period.area_ratio != null) setAreaRatio(String(d.period.area_ratio))
        if (d.period.per10_billed != null) setPer10(String(d.period.per10_billed))
      }
    }
  }, [])

  useEffect(() => {
    loadMeters(elecMonth)
    loadPeriod(elecMonth)
    setGenResult(null)
    setIssueResult(null)
    setMsg("")
  }, [elecMonth, loadMeters, loadPeriod])

  const saveMeters = async () => {
    setBusy(true); setMsg("")
    try {
      const readings = Object.entries(meterInput)
        .filter(([, v]) => v !== "")
        .map(([code, v]) => ({ code, reading: Number(v) }))
      const res = await fetch("/api/admin/billing/meters", {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ period: elecMonth, readings }),
      })
      const d = await res.json()
      if (d.success) { setFactory(d.factory); await loadMeters(elecMonth); setMsg("검침 저장됨"); }
      else setMsg(d.error || "저장 실패")
    } finally { setBusy(false) }
  }

  const savePeriod = async () => {
    setBusy(true); setMsg("")
    try {
      const res = await fetch("/api/admin/billing/periods", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ period: elecMonth, elec_total: Number(elecTotal), elec_unit_price: Number(unitPrice), area_ratio: Number(areaRatio), per10_billed: per10 === "" ? null : Number(per10) }),
      })
      const d = await res.json()
      if (d.success) { setAlloc(d.allocation); setFactory(d.factory); setPyeongSum(Number(d.pyeong_sum_area || 0)); setMsg("전기료 파라미터 저장됨"); }
      else setMsg(d.error || "저장 실패")
    } finally { setBusy(false) }
  }

  const generate = async () => {
    setBusy(true); setMsg("")
    try {
      const res = await fetch("/api/admin/billing/bills/generate", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ billMonth }),
      })
      const d = await res.json()
      if (d.success) setGenResult(d); else setMsg(d.error || "생성 실패")
    } finally { setBusy(false) }
  }

  const issue = async () => {
    if (!confirm(`${monthLabel(billMonth)} 청구서를 일괄 발행하고 메일을 발송할까요?`)) return
    setBusy(true); setMsg("")
    try {
      const res = await fetch("/api/admin/billing/bills/issue", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ period: billMonth }),
      })
      const d = await res.json()
      if (d.success) setIssueResult(d); else setMsg(d.error || "발행 실패")
    } finally { setBusy(false) }
  }

  const steps = ["검침 입력", "전기료 배분", "청구서 생성", "발행"]

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="em">전기 사용월</Label>
          <Input id="em" type="month" value={elecMonth} onChange={(e) => e.target.value && setElecMonth(e.target.value)} className="w-40" />
        </div>
        <p className="pb-2 text-sm text-text-secondary">
          → 청구월 <b className="text-dark">{monthLabel(billMonth)}</b> 청구서 = {monthLabel(billMonth)} 임대료 + {monthLabel(elecMonth)} 전기사용료
        </p>
      </div>

      {pyeongSum === 0 && (
        <div className="mb-6 rounded-md border border-gold/40 bg-gold/5 p-4 text-sm">
          <p className="font-medium text-dark">먼저 호실·계약을 등록하세요</p>
          <p className="mt-1 text-text-secondary">
            면적별 계약이 없어 전기료 배분과 청구서 생성이 되지 않습니다.{" "}
            <a href="/admin/billing/settings" className="text-gold underline">설정 탭</a>에서 기존 정산 엑셀을 가져오거나 호실·계약을 직접 등록해 주세요.
          </p>
        </div>
      )}

      <div className="mb-6 flex gap-1">
        {steps.map((s, i) => (
          <button key={i} onClick={() => setStep(i + 1)}
            className={`flex-1 rounded-md border px-3 py-2 text-sm ${step === i + 1 ? "border-gold bg-gold/10 font-semibold text-dark" : "border-warm-tan text-text-secondary hover:bg-warm-beige"}`}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {msg && <div className="mb-4 rounded-md bg-warm-beige px-4 py-2 text-sm text-dark">{msg}</div>}

      {/* Step 1 검침 */}
      {step === 1 && (
        <AdminCard className="p-6">
          <h3 className="mb-1 font-semibold text-dark">{monthLabel(elecMonth)} 사용분 검침</h3>
          <p className="mb-4 text-xs text-text-secondary">계량기별 당월 누적 지침을 입력하세요. 사용량 = 당월 − 전월.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {meters.map((m) => {
              const cur = meterInput[m.code] ?? ""
              const usage = cur !== "" && m.prev_reading != null ? Number(cur) - Number(m.prev_reading) : null
              return (
                <div key={m.code} className="rounded-md border border-warm-tan p-3">
                  <p className="mb-2 text-sm font-medium text-dark">{m.name} <span className="text-xs text-text-tertiary">({m.code})</span></p>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-xs text-text-secondary">전월 {m.prev_reading ?? "-"}</span>
                    <Input type="number" value={cur} onChange={(e) => setMeterInput((p) => ({ ...p, [m.code]: e.target.value }))} placeholder="당월 지침" className="h-8" />
                    <span className={`w-24 text-right text-xs ${usage != null && usage < 0 ? "text-destructive" : "text-text-secondary"}`}>
                      사용 {usage != null ? usage : "-"}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          {factory && (
            <p className="mt-4 text-sm text-text-secondary">공장동 청구 미리보기 — F101 {formatWon(factory.F101)} / F102 {formatWon(factory.F102)} / F103 {formatWon(factory.F103)} → 합계(A) <b>{formatWon(factory.totalA)}</b>원</p>
          )}
          <div className="mt-4 flex justify-between">
            <Button variant="outline" onClick={saveMeters} disabled={busy}>검침 저장</Button>
            <Button onClick={() => setStep(2)}>다음: 전기료 배분</Button>
          </div>
        </AdminCard>
      )}

      {/* Step 2 전기료 배분 */}
      {step === 2 && (
        <AdminCard className="p-6">
          <h3 className="mb-4 font-semibold text-dark">{monthLabel(elecMonth)} 전기료 3단 배분</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5"><Label>한전 총 전기료</Label><Input type="number" value={elecTotal} onChange={(e) => setElecTotal(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>kWh 단가</Label><Input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>면적별 배분율</Label><Input type="number" step="0.01" value={areaRatio} onChange={(e) => setAreaRatio(e.target.value)} /></div>
          </div>
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={savePeriod} disabled={busy}>계산·저장</Button>
          </div>
          {alloc && (
            <div className="mt-4 rounded-md bg-warm-beige/50 p-4 text-sm">
              <div className="grid gap-1">
                <p>공장동 부담 (A): <b>{formatWon(factory?.totalA ?? 0)}</b>원</p>
                <p>면적별 기업부담 = (총액 − A) × {areaRatio} = <b>{formatWon(Math.round(alloc.areaShare))}</b>원</p>
                <p>사무실 합계 {pyeongSum}평 → 10평당 실계산 <b>{alloc.per10Calc.toFixed(2)}</b>원 (제안 {formatWon(alloc.per10Suggested)}원)</p>
                <div className="my-2 flex items-center gap-2">
                  <Label className="text-xs">10평당 청구단가 확정</Label>
                  <Input type="number" value={per10} onChange={(e) => setPer10(e.target.value)} placeholder={String(alloc.per10Suggested)} className="h-8 w-32" />
                  <Button variant="outline" size="sm" onClick={() => setPer10(String(alloc.per10Suggested))}>제안값</Button>
                  <Button variant="outline" size="sm" onClick={savePeriod} disabled={busy}>재계산</Button>
                </div>
                <p>사무실 기업부담 (B): <b>{formatWon(alloc.officeB)}</b>원</p>
                <p>센터부담 (C): <b>{formatWon(alloc.centerC)}</b>원</p>
                <p className={alloc.checkOk ? "text-green-700" : "text-destructive"}>
                  검산 A+B+C = {formatWon((factory?.totalA ?? 0) + alloc.officeB + alloc.centerC)}원{" "}
                  {alloc.checkOk ? "✓ 배분 정상" : "⚠ 확정단가가 실계산과 크게 다르거나 센터부담이 음수입니다"}
                </p>
              </div>
            </div>
          )}
          <div className="mt-4 flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>이전</Button>
            <Button onClick={() => setStep(3)}>다음: 청구서 생성</Button>
          </div>
        </AdminCard>
      )}

      {/* Step 3 생성 */}
      {step === 3 && (
        <AdminCard className="p-6">
          <h3 className="mb-1 font-semibold text-dark">{monthLabel(billMonth)} 청구서 생성</h3>
          <p className="mb-4 text-xs text-text-secondary">{monthLabel(billMonth)} 임대료 + {monthLabel(elecMonth)} 전기료로 기업별 초안을 만듭니다. 공실은 자동 제외.</p>
          <Button onClick={generate} disabled={busy}>{busy ? "생성 중..." : "청구서 생성"}</Button>
          {genResult && (
            <div className="mt-4 rounded-md bg-warm-beige/50 p-4 text-sm">
              <p className="font-medium text-dark">생성 {genResult.created}건, 재생성 {genResult.regenerated}건{genResult.skipped.length > 0 && `, 스킵 ${genResult.skipped.length}건`}</p>
              {genResult.skipped.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-text-secondary">
                  {genResult.skipped.map((s, i) => <li key={i}>{s.tenant_name}: {s.reason}</li>)}
                </ul>
              )}
            </div>
          )}
          <div className="mt-4 flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>이전</Button>
            <Button onClick={() => setStep(4)}>다음: 발행</Button>
          </div>
        </AdminCard>
      )}

      {/* Step 4 발행 */}
      {step === 4 && (
        <AdminCard className="p-6">
          <h3 className="mb-1 font-semibold text-dark">{monthLabel(billMonth)} 청구서 발행</h3>
          <p className="mb-2 text-xs text-text-secondary">작성 중인 청구서를 발행하고, 청구서 PDF를 생성해 각 기업 세금계산서 메일로 발송합니다.</p>
          <p className="mb-4 text-xs text-text-secondary">발행 전 <a href="/admin/billing/bills" className="text-gold underline" target="_blank" rel="noreferrer">청구서 탭</a>에서 개별 PDF를 미리 확인할 수 있습니다.</p>
          <Button onClick={issue} disabled={busy}>{busy ? "발행 중..." : "일괄 발행 + PDF 메일"}</Button>
          {issueResult && (
            <div className="mt-4 rounded-md bg-warm-beige/50 p-4 text-sm">
              <p className="font-medium text-dark">발행 {issueResult.issued}건 · 메일 성공 {issueResult.mail.sent}건{issueResult.mail.failed > 0 && `, 실패 ${issueResult.mail.failed}건`}</p>
              {issueResult.no_email.length > 0 && <p className="mt-1 text-xs text-text-secondary">이메일 없음: {issueResult.no_email.join(", ")}</p>}
            </div>
          )}
          <div className="mt-4"><Button variant="outline" onClick={() => setStep(3)}>이전</Button></div>
        </AdminCard>
      )}
    </div>
  )
}
