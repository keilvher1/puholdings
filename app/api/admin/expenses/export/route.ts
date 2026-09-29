import { NextResponse } from "next/server"
import ExcelJS from "exceljs"
import { DOC_TYPE_LABELS, PAYMENT_LABELS, isValidDate, type ExpenseProject, type ExpenseReceipt } from "@/lib/expenses"
import { dbErrorMessage, fail, getProject, kstToday, listProjects, listReceipts, parseId, requireAdminDb } from "@/lib/expense-db"
import { FX_SOURCE_LABELS } from "@/lib/fx"

// GET /api/admin/expenses/export?project_id=[&from=&to=&q=]
// 증빙 목록 xlsx. 시트 1 "증빙 목록"(번호·거래일자·문서종류·거래처·사업자번호·비목·적요·공급가액·부가세·합계(원화)·
//   통화·외화금액·적용환율·환율기준일(출처)·결제수단·승인번호·귀속월·증빙(파일명 또는 '수기'))
//   외화 증빙의 합계는 결제일 기준 환율로 환산한 원화다.
// 시트 2: 프로젝트를 고르면 "비목별 소계"(예산 대비 집행률), 고르지 않으면 "프로젝트별 집계".
// 파일명: 사업비_증빙_{프로젝트명}_{YYYYMMDD}.xlsx (프로젝트 미지정 시 '전체')

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MONEY = "#,##0"
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3EFE6" } }
const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAF7F0" } }
const UNASSIGNED = "(비목 미지정)"

function fileSafe(name: string): string {
  return (
    name
      .replace(/[/\\:*?"<>|]/g, " ")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || "프로젝트"
  )
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const header = ws.getRow(1)
  header.font = { bold: true }
  header.alignment = { vertical: "middle", horizontal: "center" }
  header.eachCell((cell) => {
    cell.fill = HEADER_FILL
    cell.border = { bottom: { style: "thin", color: { argb: "FFBFB6A3" } } }
  })
  ws.views = [{ state: "frozen", ySplit: 1 }]
}

// "2026-09-18 (유럽중앙은행)" · 직접 입력은 "직접 입력" (기준일이 있으면 앞에)
function fxNote(r: ExpenseReceipt): string {
  const label = r.exchange_rate_source ? FX_SOURCE_LABELS[r.exchange_rate_source] : ""
  if (r.exchange_rate_date && label) return `${r.exchange_rate_date} (${label})`
  return r.exchange_rate_date || label
}

function addReceiptSheet(wb: ExcelJS.Workbook, receipts: ExpenseReceipt[], withProject: boolean) {
  const ws = wb.addWorksheet("증빙 목록")
  ws.columns = [
    { header: "번호", key: "no", width: 6 },
    ...(withProject ? [{ header: "프로젝트", key: "project", width: 24 }] : []),
    { header: "거래일자", key: "date", width: 12 },
    { header: "문서종류", key: "doc", width: 13 },
    { header: "거래처", key: "vendor", width: 26 },
    { header: "사업자번호", key: "biz", width: 14 },
    { header: "비목", key: "budget", width: 14 },
    { header: "적요", key: "purpose", width: 34 },
    { header: "공급가액", key: "supply", width: 13 },
    { header: "부가세", key: "vat", width: 11 },
    { header: "합계(원)", key: "total", width: 13 },
    { header: "통화", key: "currency", width: 7 },
    { header: "외화금액", key: "foreign", width: 12 },
    { header: "적용환율", key: "rate", width: 11 },
    { header: "환율기준일(출처)", key: "fx", width: 26 },
    { header: "결제수단", key: "pay", width: 10 },
    { header: "승인번호", key: "approval", width: 16 },
    { header: "귀속월", key: "payroll", width: 9 },
    { header: "증빙", key: "file", width: 34 },
  ]
  styleHeader(ws)

  // 거래일 오름차순이 정산 서류 관례다(목록 API는 최신순).
  const sorted = [...receipts].sort((a, b) => (a.issue_date === b.issue_date ? a.id - b.id : a.issue_date < b.issue_date ? -1 : 1))
  let sumSupply = 0
  let sumVat = 0
  let sumTotal = 0
  sorted.forEach((r, i) => {
    ws.addRow({
      no: i + 1,
      project: r.project_name,
      date: r.issue_date,
      doc: DOC_TYPE_LABELS[r.doc_type] ?? r.doc_type,
      vendor: r.vendor_name,
      biz: r.vendor_biz_no,
      budget: r.budget_item,
      purpose: r.purpose,
      supply: r.supply_amount ?? "",
      vat: r.vat_amount ?? "",
      total: r.total_amount ?? 0,
      currency: r.currency,
      foreign: r.currency !== "KRW" ? (r.foreign_amount ?? "") : "",
      rate: r.currency !== "KRW" ? (r.exchange_rate ?? "") : "",
      fx: r.currency !== "KRW" ? fxNote(r) : "",
      pay: PAYMENT_LABELS[r.payment_method] ?? r.payment_method,
      approval: r.approval_no,
      payroll: r.payroll_month,
      file: r.file_pathname ? r.file_name : "수기",
    })
    sumSupply += r.supply_amount ?? 0
    sumVat += r.vat_amount ?? 0
    sumTotal += r.total_amount ?? 0
  })
  const totalRow = ws.addRow({ no: "", vendor: `합계 ${sorted.length}건`, supply: sumSupply, vat: sumVat, total: sumTotal })
  totalRow.font = { bold: true }
  totalRow.eachCell((cell) => {
    cell.fill = TOTAL_FILL
  })
  for (const key of ["supply", "vat", "total"]) ws.getColumn(key).numFmt = MONEY
  ws.getColumn("foreign").numFmt = "#,##0.00"
  ws.getColumn("rate").numFmt = "#,##0.00##"
  ws.getColumn("purpose").alignment = { wrapText: true, vertical: "top" }
  if (sorted.length > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } }
}

function addBudgetSheet(wb: ExcelJS.Workbook, project: ExpenseProject, receipts: ExpenseReceipt[], filterNote: string) {
  const ws = wb.addWorksheet("비목별 소계")
  ws.columns = [
    { header: "비목", key: "name", width: 20 },
    { header: "예산", key: "budget", width: 15 },
    { header: "집행액", key: "spent", width: 15 },
    { header: "잔액", key: "left", width: 15 },
    { header: "집행률", key: "rate", width: 10 },
    { header: "건수", key: "count", width: 8 },
  ]
  styleHeader(ws)

  const spent = new Map<string, { amount: number; count: number }>()
  for (const r of receipts) {
    const key = r.budget_item.trim() || UNASSIGNED
    const cur = spent.get(key) ?? { amount: 0, count: 0 }
    cur.amount += r.total_amount ?? 0
    cur.count += 1
    spent.set(key, cur)
  }

  // 예산에 등록된 비목 순서대로, 그다음 예산에 없는 비목(증빙에만 있는 것)
  const names = [...project.budget_items.map((b) => b.name), ...[...spent.keys()].filter((k) => !project.budget_items.some((b) => b.name === k))]
  let sumBudget = 0
  let hasBudget = false
  let sumSpent = 0
  let sumCount = 0
  for (const name of names) {
    const budget = project.budget_items.find((b) => b.name === name)?.amount ?? null
    const s = spent.get(name) ?? { amount: 0, count: 0 }
    if (budget !== null) {
      sumBudget += budget
      hasBudget = true
    }
    sumSpent += s.amount
    sumCount += s.count
    const row = ws.addRow({
      name,
      budget: budget ?? "",
      spent: s.amount,
      left: budget !== null ? budget - s.amount : "",
      rate: budget ? s.amount / budget : "",
      count: s.count,
    })
    if (budget !== null && s.amount > budget) row.getCell("spent").font = { color: { argb: "FFC0392B" }, bold: true }
  }
  // 총계: 총사업비가 있으면 그것을 예산으로, 없으면 비목 예산 합계
  const totalBudget = project.total_budget ?? (hasBudget ? sumBudget : null)
  const totalRow = ws.addRow({
    name: project.total_budget !== null ? "합계(총사업비 기준)" : "합계",
    budget: totalBudget ?? "",
    spent: sumSpent,
    left: totalBudget !== null ? totalBudget - sumSpent : "",
    rate: totalBudget ? sumSpent / totalBudget : "",
    count: sumCount,
  })
  totalRow.font = { bold: true }
  totalRow.eachCell((cell) => {
    cell.fill = TOTAL_FILL
  })
  for (const key of ["budget", "spent", "left"]) ws.getColumn(key).numFmt = MONEY
  ws.getColumn("rate").numFmt = "0.0%"

  // 프로젝트 기본 정보(참고)
  ws.addRow([])
  const info: [string, string][] = [
    ["조회 조건", filterNote],
    ["프로젝트", project.name],
    ["지원사업", project.program_name],
    ["주관·전담기관", project.agency],
    ["사업기간", project.start_date || project.end_date ? `${project.start_date ?? ""} ~ ${project.end_date ?? ""}` : ""],
  ]
  for (const [k, v] of info) {
    if (!v) continue
    const r = ws.addRow([k, v])
    r.getCell(1).font = { bold: true }
  }
}

function addProjectSummarySheet(wb: ExcelJS.Workbook, projects: ExpenseProject[], receipts: ExpenseReceipt[]) {
  const ws = wb.addWorksheet("프로젝트별 집계")
  ws.columns = [
    { header: "프로젝트", key: "name", width: 30 },
    { header: "상태", key: "status", width: 8 },
    { header: "총사업비", key: "budget", width: 16 },
    { header: "집행액", key: "spent", width: 16 },
    { header: "집행률", key: "rate", width: 10 },
    { header: "건수", key: "count", width: 8 },
  ]
  styleHeader(ws)
  const byProject = new Map<number, { amount: number; count: number }>()
  for (const r of receipts) {
    const cur = byProject.get(r.project_id) ?? { amount: 0, count: 0 }
    cur.amount += r.total_amount ?? 0
    cur.count += 1
    byProject.set(r.project_id, cur)
  }
  for (const p of projects) {
    const s = byProject.get(p.id)
    if (!s) continue
    ws.addRow({
      name: p.name,
      status: p.status === "active" ? "진행" : "종료",
      budget: p.total_budget ?? "",
      spent: s.amount,
      rate: p.total_budget ? s.amount / p.total_budget : "",
      count: s.count,
    })
  }
  for (const key of ["budget", "spent"]) ws.getColumn(key).numFmt = MONEY
  ws.getColumn("rate").numFmt = "0.0%"
}

export async function GET(request: Request) {
  const auth = await requireAdminDb()
  if (auth.response) return auth.response
  const sql = auth.sql
  const params = new URL(request.url).searchParams
  const rawProjectId = params.get("project_id")
  const projectId = parseId(rawProjectId)
  if (rawProjectId && !projectId) return fail("프로젝트를 다시 선택하세요", 400)
  const from = params.get("from")
  const to = params.get("to")

  try {
    const project = projectId ? await getProject(sql, projectId) : null
    if (projectId && !project) return fail("없는 프로젝트입니다. 새로고침하세요.", 404)
    const receipts = await listReceipts(sql, {
      projectId,
      from: isValidDate(from) ? from : null,
      to: isValidDate(to) ? to : null,
      q: params.get("q"),
    })

    const wb = new ExcelJS.Workbook()
    wb.creator = "포항연합기술지주 사업비 정산"
    wb.created = new Date()
    addReceiptSheet(wb, receipts, !project)
    const q = (params.get("q") ?? "").trim()
    const conditions = [
      isValidDate(from) || isValidDate(to) ? `기간 ${isValidDate(from) ? from : "처음"} ~ ${isValidDate(to) ? to : "현재"}` : "",
      q ? `검색어 '${q}'` : "",
    ].filter(Boolean)
    const filterNote = conditions.length > 0 ? `${conditions.join(", ")} (조건에 맞는 증빙만 집계)` : ""
    if (project) addBudgetSheet(wb, project, receipts, filterNote)
    else addProjectSummarySheet(wb, await listProjects(sql), receipts)

    const buffer = await wb.xlsx.writeBuffer()
    const stamp = kstToday().replace(/-/g, "")
    const filename = `사업비_증빙_${project ? fileSafe(project.name) : "전체"}_${stamp}.xlsx`
    const encoded = encodeURIComponent(filename)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="expenses_${stamp}.xlsx"; filename*=UTF-8''${encoded}`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    console.error("Expense export error:", error)
    return fail(dbErrorMessage(error, "엑셀 파일을 만들지 못했습니다. 잠시 후 다시 시도하세요."), 500)
  }
}
