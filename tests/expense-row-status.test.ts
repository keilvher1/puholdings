import { describe, expect, it } from "vitest"
import {
  acknowledgeAll,
  acknowledgeReason,
  assessRow,
  findTableMatches,
  resolveInsertConflicts,
  rowsFromInbox,
  saveSummary,
  setIncluded,
  type DraftRow,
  type UploaderProject,
} from "@/components/admin/expenses/upload-model"
import type { InboxItem, ReceiptDraft } from "@/lib/expenses"

// 증빙 올리기 행 상태 4개 + 사유(계획서 4.2.1, 가드 7.2 #23).
// 랩 시드의 데스크톱 앱 대기함 6행(정상·확인 필요·중복 의심·USD 주말 환율·한 장에 2건)을 그대로 옮겨 확인한다.

const projects: UploaderProject[] = [
  {
    id: 1,
    name: "AI 기반 스마트 계량 데이터 플랫폼 실증",
    program_name: "",
    agency: "",
    start_date: "2026-04-01",
    end_date: "2026-12-31",
    budget_items: [
      { name: "인건비", amount: 48_000_000 },
      { name: "재료비", amount: 22_000_000 },
      { name: "외주용역비", amount: 30_000_000 },
      { name: "회의비", amount: 3_000_000 },
    ],
  },
  {
    id: 2,
    name: "창업보육센터 입주기업 성장 지원 운영",
    program_name: "",
    agency: "",
    start_date: "2026-03-01",
    end_date: "2026-12-31",
    budget_items: [{ name: "회의비", amount: 4_000_000 }],
  },
  {
    id: 3,
    name: "글로벌 진출 바우처",
    program_name: "",
    agency: "",
    start_date: "2026-05-01",
    end_date: "2027-02-28",
    budget_items: [{ name: "해외 마케팅", amount: 20_000_000 }],
  },
]
const byId = new Map(projects.map((p) => [p.id, p]))

function draft(over: Partial<ReceiptDraft> = {}): ReceiptDraft {
  return {
    doc_type: "receipt",
    issue_date: "",
    vendor_name: "",
    vendor_biz_no: "",
    supply_amount: null,
    vat_amount: null,
    total_amount: null,
    payment_method: "card",
    approval_no: "",
    items: [],
    budget_item: "",
    purpose: "",
    memo: "",
    currency: "KRW",
    foreign_amount: null,
    exchange_rate: null,
    exchange_rate_date: "",
    exchange_rate_source: "",
    payroll_month: "",
    suggested_project_id: null,
    project_reason: "",
    confidence: "high",
    low_confidence_fields: [],
    warnings: [],
    ...over,
  }
}

function inbox(id: number, name: string, over: Partial<InboxItem>): InboxItem {
  return {
    id,
    source: "desktop",
    file: { pathname: `expenses/receipts/2026-09/${id}-${name}`, name, type: "image/jpeg", size: 1000, hash: `hash-${id}` },
    preferred_project_id: null,
    status: "pending",
    scan_status: "ok",
    drafts: [],
    warnings: [],
    duplicates: [],
    possible_duplicates: [[]],
    error: "",
    created_at: "",
    ...over,
  }
}

function labRows(): DraftRow[] {
  const items: InboxItem[] = [
    inbox(1, "IMG_4821.jpg", {
      preferred_project_id: 1,
      drafts: [draft({ doc_type: "card_slip", issue_date: "2026-09-29", vendor_name: "윤슬카페", vendor_biz_no: "506-27-71220", supply_amount: 49091, vat_amount: 4909, total_amount: 54000, approval_no: "30458812", budget_item: "회의비", purpose: "과제 주간 회의 다과", suggested_project_id: 1 })],
    }),
    inbox(2, "스캔_20260929.pdf", {
      drafts: [
        draft({
          issue_date: "2026-09-27",
          vendor_name: "누리기계공구",
          supply_amount: 120000,
          vat_amount: 12000,
          total_amount: 142000,
          payment_method: "cash",
          budget_item: "재료비",
          suggested_project_id: 1,
          confidence: "low",
          low_confidence_fields: ["total_amount", "vendor_biz_no", "issue_date"],
          warnings: ["공급가액+부가세(132,000원)가 합계(142,000원)와 다릅니다", "영수증 하단이 잘려 사업자등록번호를 읽지 못했습니다"],
        }),
      ],
    }),
    inbox(3, "도담소프트_이체확인증.png", {
      preferred_project_id: 1,
      drafts: [draft({ doc_type: "transfer", issue_date: "2026-09-15", vendor_name: "(주)도담소프트웨어", total_amount: 9900000, payment_method: "transfer", budget_item: "외주용역비", suggested_project_id: 1, confidence: "medium", low_confidence_fields: ["issue_date"] })],
      possible_duplicates: [[{ id: 31, project_name: "AI 기반", issue_date: "2026-09-14", vendor_name: "(주)도담소프트웨어", total_amount: 9900000, doc_type: "tax_invoice", reason: "amount_party_date" }]],
    }),
    inbox(4, "invoice_northbay_oct.pdf", {
      preferred_project_id: 3,
      drafts: [
        draft({
          doc_type: "invoice",
          issue_date: "2026-09-27",
          vendor_name: "Northbay Ads Inc.",
          total_amount: Math.round(1610.4 * 1381.9),
          budget_item: "해외 마케팅",
          currency: "USD",
          foreign_amount: 1610.4,
          exchange_rate: 1381.9,
          exchange_rate_date: "2026-09-26",
          exchange_rate_source: "ecb",
          suggested_project_id: 3,
          warnings: ["결제일(2026-09-27)이 주말이라 직전 영업일(2026-09-26) 환율을 적용했습니다"],
        }),
      ],
    }),
    inbox(6, "영수증_해송식당_0918.jpg", {
      preferred_project_id: 2,
      drafts: [
        draft({ issue_date: "2026-09-18", vendor_name: "해송식당", vendor_biz_no: "506-19-30112", total_amount: 96000, budget_item: "회의비", suggested_project_id: 2, warnings: ["이 파일 속 증빙 1/2"] }),
        draft({ issue_date: "2026-09-18", vendor_name: "윤슬카페", vendor_biz_no: "506-27-71220", total_amount: 42000, budget_item: "회의비", suggested_project_id: 2, confidence: "medium", low_confidence_fields: ["vendor_biz_no"], warnings: ["이 파일 속 증빙 2/2"] }),
      ],
      possible_duplicates: [[], []],
    }),
  ]
  let rows: DraftRow[] = []
  for (const it of items) {
    const added = rowsFromInbox(`f${it.id}`, it, projects, null)
    const { prev, added: resolved } = resolveInsertConflicts(rows, added)
    rows = [...prev, ...resolved]
  }
  return rows
}

function assessAll(rows: DraftRow[]) {
  const matches = findTableMatches(rows)
  return rows.map((r) => assessRow(r, r.project_id ? byId.get(r.project_id) : undefined, matches.get(r.key)))
}

describe("행 상태 4개", () => {
  it("랩 6행: 준비 완료·확인 필요·제외(중복 의심)·안내만 있는 행", () => {
    const rows = labRows()
    expect(rows).toHaveLength(6)
    const a = assessAll(rows)
    expect(a.map((x) => x.status)).toEqual(["ready", "needs_review", "excluded", "ready", "ready", "needs_review"])
    expect(a.map((x) => x.label)).toEqual(["준비 완료", "확인 필요", "제외", "준비 완료", "준비 완료", "확인 필요"])
    // 중복 의심은 "확인 필요"가 아니라 "제외 · 중복 의심"
    expect(a[2].detail).toBe("중복 의심")
    expect(a[2].reasons.some((r) => /중복/.test(r.text))).toBe(false)
  })

  it("금액 불일치는 한 행에 한 문장(화면 검사 + 자동 인식 문장을 합침)", () => {
    const a = assessAll(labRows())[1]
    const amount = a.reasons.filter((r) => /공급가액/.test(r.text))
    expect(amount).toHaveLength(1)
    expect(amount[0].kind).toBe("amount")
    expect(amount[0].text).toBe("금액이 맞지 않아요: 공급가액+부가세 132,000원 ≠ 합계 142,000원")
    expect(amount[0].fields[0]).toBe("total_amount")
    // 사업자번호를 못 읽었다는 자동 인식 문장은 인식 불확실 사유 안으로 들어간다(별도 사유 아님)
    expect(a.reasons).toHaveLength(2)
    expect(a.reasons[0].id).toBe("low")
    expect(a.reasons[0].text).toContain("인식 신뢰도가 낮아요")
    expect(a.reasons[0].detail.join(" ")).toContain("사업자등록번호")
  })

  it("'이 파일 속 증빙 1/2'·주말 환율은 회색 안내로만 보이고 상태를 바꾸지 않는다", () => {
    const a = assessAll(labRows())
    expect(a[3].status).toBe("ready")
    expect(a[3].reasons).toHaveLength(0)
    expect(a[3].infos.join(" ")).toContain("직전 영업일")
    expect(a[3].infos.filter((t) => /직전 영업일/.test(t))).toHaveLength(1)
    expect(a[4].status).toBe("ready")
    expect(a[4].infos).toContain("이 파일 속 증빙 1/2")
  })

  it("모든 행에서 '확인했어요' 뒤 확인 필요 0개, 중복 의심 행은 계속 제외(selected=false)", () => {
    let rows = labRows()
    const before = rows.map((r) => r.selected)
    const matches = findTableMatches(rows)
    rows = rows.map((r) => acknowledgeAll(r, r.project_id ? byId.get(r.project_id) : undefined, matches.get(r.key)))
    // 확인 처리는 저장 대상(selected)을 바꾸지 않는다
    expect(rows.map((r) => r.selected)).toEqual(before)
    const a = assessAll(rows)
    expect(a.filter((x) => x.status === "needs_review")).toHaveLength(0)
    expect(a[2].status).toBe("excluded")
    expect(a[2].detail).toBe("중복 의심")
    expect(rows[2].selected).toBe(false)
    // 접힌 사유는 acknowledged로 남는다
    expect(a[1].acknowledged.map((r) => r.id).sort()).toEqual(["amount", "low"])
  })

  it("중복 의심 행에 사유별 [확인했어요]를 모두 눌러도 selected=false, 포함 스위치 뒤에만 selected=true", () => {
    const rows = labRows()
    let dup = rows[2]
    const project = byId.get(dup.project_id as number)
    for (const r of assessRow(dup, project).reasons) dup = acknowledgeReason(dup, r.id)
    dup = acknowledgeAll(dup, project)
    expect(dup.selected).toBe(false)
    expect(assessRow(dup, project).status).toBe("excluded")
    const included = setIncluded(dup, true)
    expect(included.selected).toBe(true)
    const st = assessRow(included, project)
    expect(st.status).toBe("ready")
    expect(st.infos.join(" ")).toContain("중복 의심")
    // 포함 스위치를 다시 끄면 제외로 돌아간다
    expect(assessRow(setIncluded(included, false), project).status).toBe("excluded")
  })

  it("저장 바 건수 = selected 행 수(확인 필요·입력 필요 포함), 금액 = selected 합계", () => {
    const rows = labRows()
    const matches = findTableMatches(rows)
    const assess = (r: DraftRow) => assessRow(r, r.project_id ? byId.get(r.project_id) : undefined, matches.get(r.key))
    const s = saveSummary(rows, assess)
    expect(s.count).toBe(rows.filter((r) => r.selected).length)
    expect(s.count).toBe(5)
    expect(s.sum).toBe(2_559_412)
    expect(s.review).toBe(2)
    expect(s.input).toBe(0)
    // 프로젝트를 비우면 입력 필요로 세지만 건수는 그대로(누르면 빠진 것을 알려 준다)
    const noProject = rows.map((r, i) => (i === 0 ? { ...r, project_id: null } : r))
    const s2 = saveSummary(noProject, assess)
    expect(s2.count).toBe(5)
    expect(s2.input).toBe(1)
    expect(assess(noProject[0]).status).toBe("needs_input")
  })

  it("표 안의 같은 거래 쌍: 약한 서류가 제외 · 중복 의심, 확인으로 풀리지 않는다", () => {
    const tax = inbox(10, "세금계산서.pdf", {
      preferred_project_id: 1,
      drafts: [draft({ doc_type: "tax_invoice", issue_date: "2026-09-14", vendor_name: "(주)새솔", total_amount: 5_500_000, budget_item: "외주용역비" })],
    })
    const transfer = inbox(11, "이체확인증.png", {
      preferred_project_id: 1,
      drafts: [draft({ doc_type: "transfer", issue_date: "2026-09-16", vendor_name: "(주)새솔", total_amount: 5_500_000, budget_item: "외주용역비" })],
    })
    let rows = rowsFromInbox("a", tax, projects, null)
    const { prev, added } = resolveInsertConflicts(rows, rowsFromInbox("b", transfer, projects, null))
    rows = [...prev, ...added]
    const a = assessAll(rows)
    expect(a[0].status).toBe("ready")
    expect(a[1].status).toBe("excluded")
    expect(a[1].detail).toBe("중복 의심")
    const matches = findTableMatches(rows)
    const acked = acknowledgeAll(rows[1], byId.get(1), matches.get(rows[1].key))
    expect(acked.selected).toBe(false)
  })

  it("비목 빈칸·예산 외 비목·사업 기간 밖은 확인 필요 사유, 확인하면 준비 완료", () => {
    const it2 = inbox(20, "a.jpg", {
      preferred_project_id: 1,
      drafts: [draft({ issue_date: "2026-03-02", vendor_name: "포항문구", total_amount: 11000, budget_item: "" })],
    })
    let row = rowsFromInbox("x", it2, projects, null)[0]
    const p = byId.get(1)
    const st = assessRow(row, p)
    expect(st.status).toBe("needs_review")
    expect(st.reasons.map((r) => r.id).sort()).toEqual(["budget_empty", "period"])
    expect(st.reasons.find((r) => r.id === "period")?.text).toContain("사업 기간 전 거래예요")
    row = { ...row, fields: { ...row.fields, budget_item: "간식비" } }
    expect(assessRow(row, p).reasons.map((r) => r.text)).toContain("예산에 없는 비목이에요: 간식비")
    row = acknowledgeAll(row, p)
    expect(assessRow(row, p).status).toBe("ready")
  })
})
