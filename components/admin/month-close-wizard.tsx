"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AdminCard, StepIntro, HelpNote } from "@/components/admin/admin-ui"
import { MeterScanPanel } from "@/components/admin/meter-scan-panel"
import { formatWon } from "@/lib/billing"

// 사용월(elecMonth) 기준 마법사. 청구월 = 사용월 + 1.
function nextMonth(period: string): string {
  const [y, m] = period.split("-").map(Number)
  const d = new Date(Date.UTC(y, m, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}
function prevMonth(period: string): string {
  const [y, m] = period.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}
function thisMonthPeriod(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`
}
const monthLabel = (p: string) => `${Number(p.slice(5, 7))}월`

interface Meter { id: number; name: string; code: string; curr_reading: number | null; prev_reading: number | null; usage: number | null }
interface BillRow { tenant_id: number; tenant_name: string; total_amount: string }
interface CompareRow { tenant_name: string; curr: number; prev: number | null }
interface Factory { F101: number; F102: number; F103: number; totalA: number }
interface Allocation { areaShare: number; per10Calc: number; per10Suggested: number; per10Billed: number; officeB: number; centerC: number; checkOk: boolean }

export function MonthCloseWizard() {
  const [elecMonth, setElecMonth] = useState(thisMonthPeriod())
  const billMonth = nextMonth(elecMonth)
  const [step, setStep] = useState(1)
  // 사용월을 빠르게 전환할 때 이전 달 응답이 늦게 도착해 새 달 폼을 덮어쓰지 않도록 최신 월만 반영
  const monthRef = useRef(elecMonth)

  const [meters, setMeters] = useState<Meter[]>([])
  const [meterInput, setMeterInput] = useState<Record<string, string>>({})
  const [factory, setFactory] = useState<Factory | null>(null)

  const [elecTotal, setElecTotal] = useState("")
  const [unitPrice, setUnitPrice] = useState("102")
  const [areaRatio, setAreaRatio] = useState("0.70")
  const [per10, setPer10] = useState("")
  const [alloc, setAlloc] = useState<Allocation | null>(null)
  const [pyeongSum, setPyeongSum] = useState(0)

  const [genResult, setGenResult] = useState<{ created: number; regenerated: number; reissued?: number; reissuable?: number; reissuable_elec_diff?: number; removed?: number; per10_billed?: number; elec_sum?: number; unmapped_metered?: string[]; skipped: { tenant_name: string; reason: string }[] } | null>(null)
  const [compare, setCompare] = useState<CompareRow[] | null>(null)
  const [issueResult, setIssueResult] = useState<{ issued: number; corrected?: number; mail: { sent: number; failed: number }; no_email: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")

  const loadMeters = useCallback(async (p: string) => {
    const res = await fetch(`/api/admin/billing/meters?period=${p}`, { credentials: "include" })
    const d = await res.json()
    if (monthRef.current !== p) return
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
    if (monthRef.current !== p) return
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

  // 청구월과 그 전월 청구서를 조회해 기업별 전월 대비 증감 표를 만든다.
  const loadCompare = useCallback(async (bm: string) => {
    try {
      const [cur, prev] = await Promise.all([
        fetch(`/api/admin/billing/bills?period=${bm}`, { credentials: "include" }).then((r) => r.json()),
        fetch(`/api/admin/billing/bills?period=${prevMonth(bm)}`, { credentials: "include" }).then((r) => r.json()),
      ])
      if (!cur.success) { setCompare(null); return }
      const prevMap = new Map<number, number>(
        prev.success ? (prev.bills as BillRow[]).map((b) => [b.tenant_id, Number(b.total_amount)]) : []
      )
      const rows: CompareRow[] = (cur.bills as BillRow[]).map((b) => ({
        tenant_name: b.tenant_name,
        curr: Number(b.total_amount),
        prev: prevMap.has(b.tenant_id) ? prevMap.get(b.tenant_id)! : null,
      }))
      setCompare(rows.length > 0 ? rows : null)
    } catch {
      setCompare(null)
    }
  }, [])

  useEffect(() => {
    monthRef.current = elecMonth
    // 사용월 전환 시 이전 달 입력값이 새 달 파라미터로 잔존하지 않도록 먼저 리셋
    setElecTotal("")
    setPer10("")
    setAreaRatio("0.70")
    setAlloc(null)
    setFactory(null)
    loadMeters(elecMonth)
    loadPeriod(elecMonth)
    setGenResult(null)
    setIssueResult(null)
    setCompare(null)
    setMsg("")
  }, [elecMonth, loadMeters, loadPeriod])

  useEffect(() => {
    if (step === 3) loadCompare(billMonth)
  }, [step, billMonth, genResult, loadCompare])

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
    // 확정단가를 비운 채 저장하면 per10_billed가 NULL로 남고, 청구서 생성은 그때그때의
    // 제안값으로 조용히 대체한다 — 검침이 나중에 바뀌면 단가도 같이 흔들린다.
    // 빈칸으로 저장하려는 순간에 확정을 유도한다.
    let per10ToSave = per10
    if (per10ToSave === "" && alloc) {
      if (confirm(
        `10평당 청구단가를 확정하지 않았습니다.\n\n` +
        `이대로 저장하면 청구서 생성 때마다 그 시점의 제안값(현재 ${formatWon(alloc.per10Suggested)}원)이 쓰이고,\n` +
        `검침·한전 총액이 바뀌면 단가도 같이 바뀝니다.\n\n제안값 ${formatWon(alloc.per10Suggested)}원으로 확정할까요?`
      )) {
        per10ToSave = String(alloc.per10Suggested)
        setPer10(per10ToSave)
      }
    }
    setBusy(true); setMsg("")
    try {
      const res = await fetch("/api/admin/billing/periods", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ period: elecMonth, elec_total: Number(elecTotal), elec_unit_price: Number(unitPrice), area_ratio: Number(areaRatio), per10_billed: per10ToSave === "" ? null : Number(per10ToSave) }),
      })
      const d = await res.json()
      if (d.success) { setAlloc(d.allocation); setFactory(d.factory); setPyeongSum(Number(d.pyeong_sum_area || 0)); setMsg("전기료 파라미터 저장됨"); }
      else setMsg(d.error || "저장 실패")
    } finally { setBusy(false) }
  }

  const generate = async (opts: { force?: boolean; regenerateIssued?: boolean; silentReissuePrompt?: boolean } = {}) => {
    setBusy(true); setMsg("")
    try {
      const res = await fetch("/api/admin/billing/bills/generate", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({
          billMonth,
          ...(opts.force ? { force: true } : {}),
          ...(opts.regenerateIssued ? { regenerate_issued: true } : {}),
        }),
      })
      const d = await res.json()
      if (d.success) {
        setGenResult(d)
        // 발행됨 → 초안으로 되돌린 건이 있으면 4단계에서 다시 발행해야 하므로 이전 발행 결과를 지운다
        if (d.reissued > 0) setIssueResult(null)
        // [청구서 생성] 한 번으로 끝나게 한다 — 발행됐다는 이유로 최신 값이 반영되지 못한 건이
        // 있으면 그 자리에서 바로 물어보고 이어서 재생성한다(따로 버튼을 찾아 누르지 않아도 되도록).
        if (!opts.regenerateIssued && d.reissuable > 0 && !opts.silentReissuePrompt) {
          setBusy(false)
          if (confirmReissue(d.reissuable)) { await generate({ ...opts, regenerateIssued: true }); return }
        }
      } else if (d.needs_force) {
        if (confirm(`${d.error}\n\n그래도 전기료 0원으로 생성할까요?`)) { setBusy(false); await generate({ ...opts, force: true }); return }
        setMsg(d.error)
      } else setMsg(d.error || "생성 실패")
    } finally { setBusy(false) }
  }

  const confirmReissue = (n: number) =>
    confirm(
      `이미 발행된 ${n}건에는 최신 전기료·임대료가 반영되지 않았습니다.\n\n` +
      `이 ${n}건을 '작성 중' 초안으로 되돌리고 다시 만들까요?\n\n` +
      `· 내용이 실제로 달라지는 건만 되돌립니다(불필요한 정정 메일 방지).\n` +
      `· 기존 청구서 PDF는 폐기되고, 4단계에서 다시 발행할 때 새로 만들어집니다.\n` +
      `· 4단계 발행을 다시 눌러야 기업에 정정 청구서 메일이 나갑니다.\n` +
      `· 되돌린 동안에는 입주기업 포털에서 해당 청구서가 보이지 않습니다 — 재발행하면 다시 나타나므로 이어서 진행하세요.\n` +
      `· 납부 완료(paid)·수기 청구서는 건드리지 않습니다.\n\n계속할까요?`
    )

  // 위 확인창에서 [취소]한 뒤 마음이 바뀌었을 때 쓰는 명시적 경로.
  const regenerateIssued = async () => {
    if (!confirmReissue(genResult?.reissuable ?? 0)) return
    await generate({ regenerateIssued: true })
  }

  const issue = async (force = false) => {
    if (!force && !confirm(`${monthLabel(billMonth)} 청구서를 일괄 발행하고 메일을 발송할까요?`)) return
    setBusy(true); setMsg("")
    try {
      const res = await fetch("/api/admin/billing/bills/issue", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ period: billMonth, ...(force ? { force: true } : {}) }),
      })
      const d = await res.json()
      if (d.success) setIssueResult(d)
      else if (d.needs_regenerate) {
        if (confirm(`${d.error}\n\n그래도 전기료 0원인 채로 발행할까요?`)) { setBusy(false); await issue(true); return }
        setMsg(d.error)
      } else setMsg(d.error || "발행 실패")
    } finally { setBusy(false) }
  }

  const steps = ["검침 입력", "전기료 배분", "청구서 생성", "발행"]
  // 각 단계가 끝났는지 — 탭에 ✓로 표시해 "지금 어디까지 했는지"를 한눈에 보이게 한다.
  const stepDone = [
    meters.length > 0 && meters.every((m) => (meterInput[m.code] ?? "") !== ""),
    alloc !== null && elecTotal !== "" && per10 !== "",
    genResult !== null,
    issueResult !== null,
  ]

  return (
    <div>
      <StepIntro>
        <b className="text-dark">한 달치 관리비를 마감하는 화면입니다.</b> 왼쪽에서 <b className="text-dark">전기를 쓴 달</b>을 고르면,
        그 다음 달 청구서가 만들어집니다. 네 단계를 순서대로 밟으면 되고, 각 단계는 저장 버튼을 누르기 전까지 아무것도 바뀌지 않습니다.
        <br />
        <span className="mt-1 inline-block">
          ① 계량기 숫자 넣기 → ② 한전 요금을 공장동·사무실·센터로 나누기 → ③ 기업별 청구서 초안 만들기 → ④ 발행하고 메일 보내기
        </span>
      </StepIntro>

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="em">전기 사용월</Label>
          <Input id="em" type="month" value={elecMonth} onChange={(e) => e.target.value && setElecMonth(e.target.value)} className="w-40" />
        </div>
        <p className="pb-2 text-sm text-text-secondary">
          → 청구월 <b className="text-dark">{monthLabel(billMonth)}</b> 청구서 = {monthLabel(billMonth)} 임대료 + {monthLabel(elecMonth)} 전기사용료
        </p>
      </div>

      <HelpNote title="왜 전기 사용월과 청구월이 다른가요?">
        전기요금은 한 달 쓰고 그 다음 달에 고지됩니다. 그래서 <b className="text-dark">{monthLabel(elecMonth)}에 쓴 전기</b>는
        {" "}<b className="text-dark">{monthLabel(billMonth)} 청구서</b>에 실립니다. 반면 임대료·관리비는 그 달 것을 그 달에 받으므로
        {monthLabel(billMonth)} 청구서에는 {monthLabel(billMonth)} 임대료가 들어갑니다.
        <br />
        따라서 위 칸에는 <b className="text-dark">한전 고지서에 적힌 &lsquo;사용월&rsquo;</b>을 넣으세요. 청구월은 자동으로 정해집니다.
      </HelpNote>

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
            {stepDone[i] ? "\u2713" : `${i + 1}.`} {s}
          </button>
        ))}
      </div>

      {msg && <div className="mb-4 rounded-md bg-warm-beige px-4 py-2 text-sm text-dark">{msg}</div>}

      {/* Step 1 검침 */}
      {step === 1 && (
        <AdminCard className="p-6">
          <h3 className="mb-1 font-semibold text-dark">1단계 · {monthLabel(elecMonth)} 사용분 검침</h3>
          <StepIntro>
            공장동 계량기 4개의 <b className="text-dark">현재 숫자(누적 지침)</b>를 넣는 단계입니다.
            계량기는 쓴 만큼 계속 올라가는 누적값이라, <b className="text-dark">이번 달 사용량 = 이번 달 숫자 − 지난달 숫자</b>로 자동 계산됩니다.
            지난달 숫자는 이미 저장돼 있으니 이번 달 것만 넣으면 됩니다.
          </StepIntro>

          <div className="mb-4">
            <MeterScanPanel
              period={elecMonth}
              onApplyReadings={(readings) => {
                setMeterInput((prev) => ({ ...prev, ...readings }))
                setMsg("사진 판독값을 채웠습니다. 숫자를 확인한 뒤 [검침 저장]을 눌러 주세요.")
              }}
              onApplyKepco={(total) => setElecTotal(String(total))}
            />
          </div>

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
          <HelpNote title="계량기 4개가 각각 무엇인가요?">
            <ul className="list-disc space-y-0.5 pl-4">
              <li><b className="text-dark">공장동 전체(MAIN)</b> — 공장동에 들어가는 전기 전부를 재는 주계량기입니다.</li>
              <li><b className="text-dark">F101 · F103</b> — 각 호실 전용 계량기입니다. 그 호실이 쓴 만큼만 잽니다.</li>
              <li><b className="text-dark">냉난방기(HVAC)</b> — F101·F103이 함께 쓰는 냉난방기 계량기입니다. &lsquo;동력기&rsquo;라고도 부릅니다.</li>
            </ul>
            <p className="mt-1.5">
              F102호는 별도 계량기가 없습니다. <b className="text-dark">공장동 전체에서 나머지를 뺀 값</b>으로 계산되기 때문에,
              MAIN 숫자가 틀리면 F102 요금이 통째로 틀어집니다. MAIN을 가장 신경 써서 확인하세요.
            </p>
          </HelpNote>

          <HelpNote title="사용량이 빨간색 음수로 나옵니다">
            이번 달 숫자가 지난달보다 작다는 뜻입니다. 대부분 <b className="text-dark">자릿수를 하나 빠뜨렸거나 오타</b>입니다.
            음수가 하나라도 있으면 3단계에서 청구서 생성이 막히므로, 여기서 바로잡아야 합니다.
            계량기를 교체해 숫자가 0부터 다시 시작한 경우라면 개발자에게 문의하세요.
          </HelpNote>

          <div className="mt-4 flex justify-between">
            <Button variant="outline" onClick={saveMeters} disabled={busy}>검침 저장</Button>
            <Button onClick={() => setStep(2)}>다음: 전기료 배분</Button>
          </div>
        </AdminCard>
      )}

      {/* Step 2 전기료 배분 */}
      {step === 2 && (
        <AdminCard className="p-6">
          <h3 className="mb-1 font-semibold text-dark">2단계 · {monthLabel(elecMonth)} 전기료 3단 배분</h3>
          <StepIntro>
            한전에서 청구된 <b className="text-dark">건물 전체 전기요금 하나</b>를 세 몫으로 나누는 단계입니다.
            <br />
            <b className="text-dark">A 공장동</b> — 계량기로 실제 쓴 만큼 (1단계 숫자에서 자동 계산) ·{" "}
            <b className="text-dark">B 사무실 기업</b> — 평수에 비례해 배분 ·{" "}
            <b className="text-dark">C 센터</b> — 복도·공용부 등 남는 몫을 센터가 부담
            <br />
            아래 세 칸을 채우고 [계산·저장]을 누르면 A·B·C가 계산되고, 셋을 더한 값이 한전 총액과 맞는지 검산까지 보여 줍니다.
          </StepIntro>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>한전 총 전기료 (원)</Label>
              <Input type="number" value={elecTotal} onChange={(e) => setElecTotal(e.target.value)} placeholder="예: 1820690" />
              <p className="text-[11px] leading-snug text-text-tertiary">한전 고지서의 <b>청구금액</b>. 사용량(kWh)이 아닙니다.</p>
            </div>
            <div className="grid gap-1.5">
              <Label>kWh 단가 (원)</Label>
              <Input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
              <p className="text-[11px] leading-snug text-text-tertiary">공장동 요금 계산에 쓰는 단가. 한전 단가가 바뀐 달에만 고치세요.</p>
            </div>
            <div className="grid gap-1.5">
              <Label>면적별 배분율</Label>
              <Input type="number" step="0.01" value={areaRatio} onChange={(e) => setAreaRatio(e.target.value)} />
              <p className="text-[11px] leading-snug text-text-tertiary">공장동을 뺀 나머지 중 사무실 기업이 부담할 비율. 기본 0.70(70%).</p>
            </div>
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
                <p className="mt-1 text-[11px] leading-snug text-text-tertiary [word-break:keep-all]">
                  실계산값을 그대로 쓰면 청구액에 자잘한 끝자리가 생깁니다. 보기 좋은 금액으로 다듬은 것이 <b>제안값</b>이고,
                  실제 청구에 쓸 값이 <b>확정단가</b>입니다. 특별한 이유가 없으면 [제안값]을 누르세요.
                </p>
                <div className="my-2 flex items-center gap-2">
                  <Label className="text-xs">10평당 청구단가 확정</Label>
                  <Input type="number" value={per10} onChange={(e) => setPer10(e.target.value)} placeholder={String(alloc.per10Suggested)} className="h-8 w-32" />
                  <Button variant="outline" size="sm" onClick={() => setPer10(String(alloc.per10Suggested))}>제안값</Button>
                  <Button variant="outline" size="sm" onClick={savePeriod} disabled={busy}>재계산</Button>
                </div>
                {per10 === "" && (
                  <p className="text-destructive">⚠ 확정단가가 비어 있습니다 — 지금은 제안값 {formatWon(alloc.per10Suggested)}원이 임시로 쓰입니다. [제안값] → [재계산]으로 확정하세요.</p>
                )}
                <p>사무실 기업부담 (B): <b>{formatWon(alloc.officeB)}</b>원</p>
                <p>센터부담 (C): <b>{formatWon(alloc.centerC)}</b>원</p>
                <p className={alloc.checkOk ? "text-green-700" : "text-destructive"}>
                  검산 A+B+C = {formatWon((factory?.totalA ?? 0) + alloc.officeB + alloc.centerC)}원{" "}
                  {alloc.checkOk ? "✓ 배분 정상" : "⚠ 확정단가가 실계산과 크게 다르거나 센터부담이 음수입니다"}
                </p>
              </div>
            </div>
          )}
          <HelpNote title="검산이 ⚠로 뜹니다 — 무엇을 봐야 하나요?">
            A+B+C가 한전 총액과 맞지 않거나 센터 부담(C)이 음수라는 뜻입니다. 흔한 원인은 셋입니다.
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li><b className="text-dark">한전 총액 오타</b> — 자릿수를 확인하세요. 가장 흔합니다.</li>
              <li><b className="text-dark">1단계 검침 오류</b> — 공장동 부담(A)이 총액보다 커지면 나눌 몫이 남지 않습니다.</li>
              <li><b className="text-dark">확정단가를 임의로 크게 올림</b> — 사무실 부담(B)이 커져 센터 몫(C)이 음수가 됩니다.</li>
            </ul>
            <p className="mt-1.5">검산이 ⚠인 채로도 다음 단계로 넘어갈 수는 있지만, 그대로 발행하면 금액이 틀립니다.</p>
          </HelpNote>

          <div className="mt-4 flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>이전</Button>
            <Button onClick={() => setStep(3)}>다음: 청구서 생성</Button>
          </div>
        </AdminCard>
      )}

      {/* Step 3 생성 */}
      {step === 3 && (
        <AdminCard className="p-6">
          <h3 className="mb-1 font-semibold text-dark">3단계 · {monthLabel(billMonth)} 청구서 생성</h3>
          <StepIntro>
            앞의 두 단계 결과로 <b className="text-dark">기업별 청구서 초안</b>을 만듭니다.
            {monthLabel(billMonth)} 임대료·관리비에 {monthLabel(elecMonth)} 전기료를 더하고, 공실과 퇴실 기업은 자동으로 빠집니다.
            <br />
            <b className="text-dark">아직 발행이 아니라 &lsquo;작성 중&rsquo; 초안입니다.</b> 여러 번 눌러도 안전하며, 초안은 누를 때마다 최신 값으로 다시 만들어집니다.
            <br />
            다만 <b className="text-dark">이미 발행된 청구서는 다시 만들어지지 않습니다</b> — 1·2단계(검침·전기료 배분)를 먼저 끝내고 여기로 오세요.
            발행 뒤에 전기료를 입력했다면 아래 경고 박스의 되돌리기 버튼을 쓰면 됩니다.
          </StepIntro>
          <Button onClick={() => generate()} disabled={busy}>{busy ? "생성 중..." : "청구서 생성"}</Button>
          {genResult && (
            <div className="mt-4 rounded-md bg-warm-beige/50 p-4 text-sm">
              <p className="font-medium text-dark">생성 {genResult.created}건, 재생성 {genResult.regenerated}건{(genResult.reissued ?? 0) > 0 && `, 발행분 되돌려 재생성 ${genResult.reissued}건`}{(genResult.removed ?? 0) > 0 && `, 퇴실·공실 정리 ${genResult.removed}건`}{genResult.skipped.length > 0 && `, 스킵 ${genResult.skipped.length}건`}</p>
              {genResult.per10_billed != null && (
                <p className="mt-0.5 text-xs text-text-secondary">
                  적용된 10평당 전기 단가: {formatWon(genResult.per10_billed)}원
                  {genResult.elec_sum != null && ` · 이번에 반영된 ${monthLabel(elecMonth)} 전기료 합계 ${formatWon(genResult.elec_sum)}원`}
                </p>
              )}
              {(genResult.reissued ?? 0) > 0 && (
                <p className="mt-2 rounded bg-gold/15 px-2 py-1.5 text-xs text-dark">
                  되돌린 {genResult.reissued}건은 다시 <b>&lsquo;작성 중&rsquo;</b> 상태입니다. <b>4단계에서 발행을 다시 눌러야</b> 정정 청구서 PDF가 새로 만들어지고 메일이 나갑니다.
                </p>
              )}
              {(genResult.unmapped_metered?.length ?? 0) > 0 && (
                <p className="mt-2 rounded bg-destructive/10 px-2 py-1.5 text-xs text-dark">
                  <b>검침 계량기에 연결되지 않은 호실이 있어 전기료가 0원으로 들어갔습니다</b> — {genResult.unmapped_metered!.join(", ")}.
                  설정 탭에서 계약의 호실·전기 방식을 확인하세요.
                </p>
              )}
              {genResult.skipped.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-text-secondary">
                  {genResult.skipped.map((s, i) => <li key={i}>{s.tenant_name}: {s.reason}</li>)}
                </ul>
              )}
            </div>
          )}
          {/* 이미 발행된 건은 기본적으로 재생성되지 않는다 —
              전기 파라미터를 발행 뒤에 입력한 경우 이걸 모르면 영원히 반영되지 않으므로 크게 경고한다. */}
          {(genResult?.reissuable ?? 0) > 0 && (
            <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
              <p className="font-medium text-dark">
                이미 발행된 {genResult!.reissuable}건에 최신 값이 반영되지 않았습니다.
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                발행된 청구서는 다시 만들어지지 않습니다. 지금 되돌려 다시 만들면
                {(genResult!.reissuable_elec_diff ?? 0) !== 0 && (
                  <> {monthLabel(elecMonth)} 전기료 <b className="text-dark">{formatWon(genResult!.reissuable_elec_diff!)}원</b>이 추가로 반영됩니다.</>
                )}
                {(genResult!.reissuable_elec_diff ?? 0) === 0 && <> 금액이 달라집니다.</>}
                {" "}되돌린 뒤 <b className="text-dark">4단계에서 발행을 다시 눌러야</b> 정정 청구서가 나갑니다.
              </p>
              <Button variant="destructive" className="mt-3" onClick={regenerateIssued} disabled={busy}>
                {busy ? "처리 중..." : `발행된 ${genResult!.reissuable}건 초안으로 되돌려 다시 만들기`}
              </Button>
            </div>
          )}
          {compare && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-dark">{monthLabel(billMonth)} 청구액 — 전월({monthLabel(prevMonth(billMonth))}) 대비</p>
              <div className="max-h-80 overflow-y-auto rounded-md border border-warm-tan">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-warm-beige/80 text-xs text-text-secondary">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">기업</th>
                      <th className="px-3 py-2 text-right font-medium">전월</th>
                      <th className="px-3 py-2 text-right font-medium">이번 달</th>
                      <th className="px-3 py-2 text-right font-medium">증감</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compare.map((r, i) => {
                      const diff = r.prev != null ? r.curr - r.prev : null
                      const pct = diff != null && r.prev ? Math.round((diff / r.prev) * 1000) / 10 : null
                      return (
                        <tr key={i} className="border-t border-warm-tan/50">
                          <td className="px-3 py-1.5 text-dark">{r.tenant_name}</td>
                          <td className="px-3 py-1.5 text-right text-text-secondary">{r.prev != null ? `${formatWon(r.prev)}원` : "—"}</td>
                          <td className="px-3 py-1.5 text-right font-medium text-dark">{formatWon(r.curr)}원</td>
                          <td className={`px-3 py-1.5 text-right text-xs ${diff == null ? "text-text-tertiary" : diff > 0 ? "text-destructive" : diff < 0 ? "text-blue-700" : "text-text-secondary"}`}>
                            {diff == null
                              ? "신규"
                              : diff === 0
                                ? "동일"
                                : `${diff > 0 ? "▲" : "▼"} ${formatWon(Math.abs(diff))}원${pct != null ? ` (${pct > 0 ? "+" : ""}${pct}%)` : ""}`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-[11px] text-text-secondary">증감이 큰 기업은 발행 전에 검침·배분 값을 다시 확인하세요.</p>
              <HelpNote title="전월 대비 표는 왜 보여 주나요?">
                금액이 틀렸을 때 가장 빨리 알아채는 방법이기 때문입니다. 임대료는 계약이 그대로면 매달 같으므로,
                한 기업만 갑자기 크게 오르내렸다면 대개 <b className="text-dark">검침 오타</b>이거나 <b className="text-dark">계약 변경·일할 계산</b>이 반영된 것입니다.
                전자라면 1단계로 돌아가 고치고, 후자라면 그대로 두면 됩니다. &lsquo;신규&rsquo;는 이번 달 처음 청구되는 기업입니다.
              </HelpNote>
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
          <h3 className="mb-1 font-semibold text-dark">4단계 · {monthLabel(billMonth)} 청구서 발행</h3>
          <StepIntro tone="warn">
            <b className="text-dark">여기부터는 되돌리기 어렵습니다.</b> 초안이 &lsquo;발행됨&rsquo;으로 바뀌고,
            청구서 PDF가 만들어져 각 기업 담당자 메일로 <b className="text-dark">실제로 발송</b>됩니다.
            누르기 전에 3단계의 전월 대비 표에서 금액이 이상한 기업이 없는지 꼭 확인하세요.
          </StepIntro>
          <p className="mb-4 text-xs text-text-secondary">발행 전 <a href="/admin/billing/bills" className="text-gold underline" target="_blank" rel="noreferrer">청구서 탭</a>에서 개별 PDF를 미리 확인할 수 있습니다.</p>
          <Button onClick={() => issue()} disabled={busy}>{busy ? "발행 중..." : "일괄 발행 + PDF 메일"}</Button>
          {issueResult && (
            <div className="mt-4 rounded-md bg-warm-beige/50 p-4 text-sm">
              <p className="font-medium text-dark">발행 {issueResult.issued}건 · 메일 성공 {issueResult.mail.sent}건{issueResult.mail.failed > 0 && `, 실패 ${issueResult.mail.failed}건`}</p>
              {(issueResult.corrected ?? 0) > 0 && (
                <p className="mt-1 text-xs text-text-secondary">이 중 {issueResult.corrected}건은 재발행이라 제목에 <b className="text-dark">[정정]</b>이 붙어 나갔습니다.</p>
              )}
              {issueResult.no_email.length > 0 && <p className="mt-1 text-xs text-text-secondary">이메일 없음: {issueResult.no_email.join(", ")}</p>}
            </div>
          )}
          <div className="mt-4"><Button variant="outline" onClick={() => setStep(3)}>이전</Button></div>
        </AdminCard>
      )}
    </div>
  )
}
