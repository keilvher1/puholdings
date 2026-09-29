import { describe, expect, it } from "vitest"
import { rowsFromInbox, uploadItemFromInbox, type UploaderProject } from "@/components/admin/expenses/upload-model"
import type { InboxItem, ReceiptDraft } from "@/lib/expenses"

// 증빙 올리기 화면: 확인 대기함 항목 → 파일 카드·표 행 변환

const projects: UploaderProject[] = [
  { id: 3, name: "A", program_name: "", agency: "", start_date: null, end_date: null, budget_items: [] },
  { id: 4, name: "B", program_name: "", agency: "", start_date: null, end_date: null, budget_items: [] },
]

function draft(over: Partial<ReceiptDraft> = {}): ReceiptDraft {
  return {
    doc_type: "receipt",
    issue_date: "2026-09-10",
    vendor_name: "포항문구",
    vendor_biz_no: "",
    supply_amount: null,
    vat_amount: null,
    total_amount: 11000,
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
    suggested_project_id: 4,
    project_reason: "거래처",
    confidence: "high",
    low_confidence_fields: [],
    warnings: [],
    ...over,
  }
}

function item(over: Partial<InboxItem> = {}): InboxItem {
  return {
    id: 9,
    source: "desktop",
    file: { pathname: "expenses/receipts/2026-09/1-a.jpg", name: "a.jpg", type: "image/jpeg", size: 100, hash: "h" },
    preferred_project_id: null,
    status: "pending",
    scan_status: "ok",
    drafts: [draft()],
    warnings: [],
    duplicates: [],
    possible_duplicates: [[]],
    error: "",
    created_at: "",
    ...over,
  }
}

describe("rowsFromInbox", () => {
  it("인식 결과는 /scan과 같은 행이 되고, 기본 프로젝트가 없으면 추천 프로젝트", () => {
    const rows = rowsFromInbox("k", item(), projects, null)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ fileKey: "k", project_id: 4, projectSource: "ai", selected: true })
    expect(rows[0].fields.vendor_name).toBe("포항문구")
  })

  it("앱에서 고른 기본 프로젝트가 진행 중이면 그 프로젝트로 미리 선택", () => {
    const rows = rowsFromInbox("k", item({ preferred_project_id: 3 }), projects, null)
    expect(rows[0]).toMatchObject({ project_id: 3, projectSource: "default" })
    // 진행 중이 아니면 무시
    expect(rowsFromInbox("k", item({ preferred_project_id: 77 }), projects, null)[0].project_id).toBe(4)
  })

  it("인식 미설정은 빈 행 1개, 실패는 행 없음", () => {
    const blank = rowsFromInbox("k", item({ scan_status: "not_configured", drafts: [], preferred_project_id: 3 }), projects, null)
    expect(blank).toHaveLength(1)
    expect(blank[0]).toMatchObject({ manual: true, project_id: 3 })
    expect(rowsFromInbox("k", item({ scan_status: "failed", drafts: [] }), projects, null)).toEqual([])
  })

  it("이미 저장된 파일이면 선택 해제", () => {
    const rows = rowsFromInbox("k", item({ duplicates: [{ id: 1, project_name: "A", issue_date: "", vendor_name: "", total_amount: 0 }] }), projects, null)
    expect(rows[0].selected).toBe(false)
  })
})

describe("uploadItemFromInbox", () => {
  it("완료 카드: 서버 원본 미리보기·대기함 번호", () => {
    const it = uploadItemFromInbox("k", item())
    expect(it).toMatchObject({ status: "done", inboxId: 9, draftCount: 1, kind: "image", retryable: false })
    expect(it.localUrl).toContain("/api/file?pathname=")
  })

  it("실패 카드: 사유 + 직접 입력(fallback)", () => {
    const it = uploadItemFromInbox("k", item({ scan_status: "failed", error: "인식 실패", drafts: [] }))
    expect(it).toMatchObject({ status: "error", error: "인식 실패", retryable: false })
    expect(it.fallback?.file.pathname).toBe("expenses/receipts/2026-09/1-a.jpg")
  })
})
