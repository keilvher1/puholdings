// 사업비 정산 AI의 단일 진입점(서버 전용). lib/meter-scan.ts와 같은 패턴을 따른다.
// - analyzeProjectDocs: 사업계획서·협약서·선정 공문 등에서 프로젝트(과제) 초안 추출
// - scanReceipt: 영수증·카드전표·세금계산서·거래명세서·이체확인증 OCR → 증빙 초안
// 결과는 모두 "제안"이다. 이 모듈은 아무것도 저장하지 않으며, 관리자가 화면에서 확인·수정한 뒤에만 저장된다.
// OpenAI Responses API + strict JSON Schema(프로젝트가 zod v3이라 SDK의 zod 헬퍼는 쓰지 않는다).
// 키는 env OPENAI_API_KEY로만 받는다. 모델은 OPENAI_MODEL로 바꿀 수 있다.

import OpenAI from "openai"
import sharp from "sharp"
import {
  EXPENSE_DOC_TYPES,
  PAYMENT_METHODS,
  formatWon,
  isValidDate,
  type BudgetItem,
  type Confidence,
  type ExpenseDocType,
  type PaymentMethod,
  type ProjectDraft,
  type ReceiptDraft,
  type ReceiptFields,
  type ReceiptItem,
} from "./expenses"

const DEFAULT_MODEL = "gpt-5.6-sol"

function model(): string {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL
}

export function hasExpenseAiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY)
}

// 이미지는 base64 JPEG(prepareImageForAi 결과), PDF는 원본 base64, 텍스트는 그대로.
export type AiInput =
  | { kind: "image"; data: string; filename?: string }
  | { kind: "pdf"; filename: string; data: string }
  | { kind: "text"; text: string; filename?: string }

// 라우트가 그대로 응답에 옮길 수 있는 한국어 오류. needsSetup이면 화면은 직접 입력으로 안내한다.
export class ExpenseAiError extends Error {
  status: number
  needsSetup: boolean
  constructor(message: string, status = 502, needsSetup = false) {
    super(message)
    this.name = "ExpenseAiError"
    this.status = status
    this.needsSetup = needsSetup
  }
}

// ── 이미지 정규화 ──────────────────────────────────────────────────────────────
// EXIF 회전 반영 → 긴 변 2000px 이하 → 투명 배경은 흰색으로 → JPEG q85.
// (투명 PNG 캡처를 그냥 JPEG로 바꾸면 배경이 검게 변해 글자가 안 보인다)
export async function prepareImageForAi(buf: Buffer): Promise<string> {
  try {
    const out = await sharp(buf, { failOn: "error" })
      .rotate()
      .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85 })
      .toBuffer()
    return out.toString("base64")
  } catch {
    throw new ExpenseAiError("사진 파일을 열 수 없습니다(손상되었거나 일부만 올라간 파일). 사진을 다시 찍거나 다시 저장해 올려 주세요.", 400)
  }
}

// ── 공통 도우미 ────────────────────────────────────────────────────────────────
function kstToday(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date())
}

function pad2(n: string | number): string {
  return String(n).padStart(2, "0")
}

// 모델이 'YYYY-MM-DD'를 어겨도 흔한 표기는 살린다. 해석할 수 없으면 null.
export function normalizeDate(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.trim()
  if (isValidDate(s)) return s
  return parseLooseDate(s)
}

function parseLooseDate(s: string): string | null {
  let out: string | null = null
  let m = s.match(/^(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/)
  if (m) out = `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`
  if (!out) {
    m = s.match(/^(\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})$/)
    if (m) out = `20${m[1]}-${pad2(m[2])}-${pad2(m[3])}`
  }
  return out && isValidDate(out) ? out : null
}

function toWon(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null
  const n = Math.round(v)
  return Math.abs(n) < 1e12 ? n : null
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}

function asConfidence(v: unknown): Confidence {
  return v === "high" || v === "medium" || v === "low" ? v : "low"
}

// 사업자등록번호 검증 숫자 확인(국세청 규칙). OCR로 한 자리를 잘못 읽으면 대개 여기서 걸린다.
export function isValidBizNoChecksum(bizNo: string): boolean {
  const d = bizNo.replace(/\D/g, "")
  if (d.length !== 10) return false
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5]
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * w[i]
  sum += Math.floor((Number(d[8]) * 5) / 10)
  return (10 - (sum % 10)) % 10 === Number(d[9])
}

// SDK·HTTP 오류를 관리자가 이해할 수 있는 한국어로 바꾼다.
function toFriendlyError(error: unknown): ExpenseAiError {
  if (error instanceof ExpenseAiError) return error
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new ExpenseAiError("AI 분석이 너무 오래 걸려 중단했습니다. 잠시 후 '다시 시도'를 누르거나 파일을 나눠 올려 주세요.", 504)
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new ExpenseAiError("AI 서버에 연결하지 못했습니다. 잠시 후 '다시 시도'를 눌러 주세요.", 502)
  }
  if (error instanceof OpenAI.APIError) {
    const status = error.status ?? 0
    const code = String(error.code ?? "")
    if (status === 401 || status === 403) {
      return new ExpenseAiError(
        "AI(OpenAI) API 키가 올바르지 않거나 권한이 없습니다. 관리자에게 OPENAI_API_KEY 설정 확인을 요청하세요. 지금은 직접 입력으로 계속할 수 있습니다.",
        503,
        true,
      )
    }
    if (status === 429 && code === "insufficient_quota") {
      return new ExpenseAiError(
        "AI(OpenAI) 사용 한도가 모두 소진되었습니다. 관리자에게 OpenAI 결제·한도 확인을 요청하세요. 지금은 직접 입력으로 계속할 수 있습니다.",
        503,
        true,
      )
    }
    if (status === 429) {
      return new ExpenseAiError("AI 요청이 한꺼번에 몰려 잠시 제한되었습니다. 1분쯤 뒤 '다시 시도'를 눌러 주세요.", 429)
    }
    if (status === 404 || code === "model_not_found" || (status === 400 && /model/i.test(error.message))) {
      return new ExpenseAiError(
        `설정된 AI 모델(${model()})을 사용할 수 없습니다. 관리자에게 OPENAI_MODEL 설정 확인을 요청하세요. 지금은 직접 입력으로 계속할 수 있습니다.`,
        503,
        true,
      )
    }
    if (status === 400 || status === 413 || status === 422) {
      return new ExpenseAiError("AI가 이 파일을 읽지 못했습니다(형식·용량 문제). 사진을 다시 찍거나 PDF를 다시 저장해 올려 주세요.", 422)
    }
    if (status >= 500) {
      return new ExpenseAiError("AI 서버에 일시적인 문제가 있습니다. 잠시 후 '다시 시도'를 눌러 주세요.", 502)
    }
  }
  return new ExpenseAiError("AI 분석 중 알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", 500)
}

function inputContent(inputs: AiInput[], labelPrefix: string): OpenAI.Responses.ResponseInputContent[] {
  const content: OpenAI.Responses.ResponseInputContent[] = []
  inputs.forEach((input, i) => {
    const label = `[${labelPrefix} ${i + 1}${input.filename ? `: ${input.filename}` : ""}]`
    if (input.kind === "image") {
      content.push({ type: "input_text", text: label })
      // 영수증 글자는 작다 — 저해상도로 보내면 금액 자릿수·승인번호를 놓친다.
      content.push({ type: "input_image", image_url: `data:image/jpeg;base64,${input.data}`, detail: "high" })
    } else if (input.kind === "pdf") {
      content.push({ type: "input_text", text: label })
      content.push({ type: "input_file", filename: input.filename || "document.pdf", file_data: `data:application/pdf;base64,${input.data}` })
    } else {
      content.push({ type: "input_text", text: `${label}\n${input.text}` })
    }
  })
  return content
}

// Responses API 호출 + 거절·잘림·빈 응답·JSON 파싱 실패를 한국어 오류로 바꾼다.
async function callStructured<T>(opts: {
  system: string
  content: OpenAI.Responses.ResponseInputContent[]
  schemaName: string
  schema: Record<string, unknown>
  what: string // 오류 문구용: "영수증 판독", "사업 자료 분석"
  timeoutMs: number
  maxRetries: number
}): Promise<T> {
  // Vercel maxDuration(300초) 안에 한국어 오류로 끝낼 수 있도록 (timeout × (재시도+1))을 300초 아래로 둔다.
  const client = new OpenAI({ timeout: opts.timeoutMs, maxRetries: opts.maxRetries })
  let response: OpenAI.Responses.Response
  try {
    response = await client.responses.create({
      model: model(),
      input: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.content },
      ],
      text: { format: { type: "json_schema", name: opts.schemaName, strict: true, schema: opts.schema } },
      // 영수증에는 카드번호 일부 등 민감정보가 있다 — OpenAI 쪽에 응답을 보관하지 않는다.
      store: false,
    })
  } catch (error) {
    console.error(`[expense-ai] ${opts.what} 호출 실패:`, error instanceof Error ? error.message : error)
    throw toFriendlyError(error)
  }

  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason
    if (reason === "content_filter") {
      throw new ExpenseAiError(`AI 안전 필터 때문에 ${opts.what}을(를) 끝내지 못했습니다. 이 파일은 직접 입력해 주세요.`, 422)
    }
    throw new ExpenseAiError(`${opts.what} 결과가 너무 길어 중간에 잘렸습니다. 파일을 나눠서(페이지를 줄여) 올려 주세요.`, 422)
  }
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue
    for (const part of item.content) {
      if (part.type === "refusal") {
        throw new ExpenseAiError(`AI가 이 파일의 ${opts.what}을(를) 거절했습니다. 지출 증빙이 맞는지 확인하고, 맞다면 직접 입력해 주세요.`, 422)
      }
    }
  }
  const raw = response.output_text
  if (!raw || !raw.trim()) {
    throw new ExpenseAiError(`${opts.what} 결과가 비어 있습니다. 파일이 선명한지 확인하고 다시 시도해 주세요.`, 502)
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new ExpenseAiError(`${opts.what} 결과를 해석하지 못했습니다. 다시 시도해 주세요.`, 502)
  }
}

// ── 사업 자료 분석(프로젝트 초안) ───────────────────────────────────────────────────
// strict 모드 규칙: 모든 property가 required, additionalProperties:false, 널 허용은 type 배열.
const PROJECT_SCHEMA = {
  type: "object",
  properties: {
    projects: {
      type: "array",
      description: "자료에서 찾은 프로젝트(과제). 과제마다 1개. 사업 자료가 아니면 빈 배열.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "프로젝트(과제)명. 모르면 빈 문자열." },
          program_name: { type: "string", description: "상위 지원사업명. 없으면 빈 문자열." },
          agency: { type: "string", description: "주관·전담기관(역할 표기). 없으면 빈 문자열." },
          description: { type: "string", description: "과제 목적·내용 1~3문장 요약(한국어)." },
          start_date: { type: ["string", "null"], description: "사업(협약) 시작일 YYYY-MM-DD. 모르면 null." },
          end_date: { type: ["string", "null"], description: "사업(협약) 종료일 YYYY-MM-DD. 모르면 null." },
          total_budget: { type: ["integer", "null"], description: "총사업비(원 단위 정수, 표 단위 환산 후). 모르면 null." },
          budget_items: {
            type: "array",
            description: "비목별 예산. 합계·소계 행은 넣지 않는다.",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "비목명(예: 재료비)" },
                amount: { type: ["integer", "null"], description: "원 단위 정수(표 단위 환산 후). 모르면 null." },
              },
              required: ["name", "amount"],
              additionalProperties: false,
            },
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          note: { type: "string", description: "판단 근거·애매한 점·단위 환산 여부(한국어 1~3문장)." },
        },
        required: [
          "name",
          "program_name",
          "agency",
          "description",
          "start_date",
          "end_date",
          "total_budget",
          "budget_items",
          "confidence",
          "note",
        ],
        additionalProperties: false,
      },
    },
    warnings: {
      type: "array",
      description: "파일 전체에 관한 경고(읽을 수 없는 페이지, 사업 자료가 아님 등). 한국어. 없으면 빈 배열.",
      items: { type: "string" },
    },
  },
  required: ["projects", "warnings"],
  additionalProperties: false,
} as const

interface RawProject {
  name: string
  program_name: string
  agency: string
  description: string
  start_date: string | null
  end_date: string | null
  total_budget: number | null
  budget_items: { name: string; amount: number | null }[]
  confidence: string
  note: string
}

const PROJECT_SYSTEM = `너는 한국 정부·지자체·공공기관 지원사업(R&D 과제, 창업사업화, 지역혁신 사업 등)의 사업비 정산 담당자를 돕는 보조원이다.
관리자가 올린 사업 자료(사업계획서, 협약서, 선정·협약 공문, 예산 명세서, 사업 공고 등)를 읽고, 이 기관이 수행하는 프로젝트(과제)의 기본 정보를 뽑아낸다.
결과는 '제안값'이며 관리자가 확인·수정한 뒤 저장한다. 자료에 없는 값은 절대 지어내지 말고 ''(문자열) 또는 null(날짜·금액)로 둔다. 틀린 값을 그럴듯하게 채우는 것이 빈칸보다 훨씬 나쁘다.

## 무엇을 뽑나
- name: 프로젝트(과제)명. '과제명', '사업(과제)명', '아이템명', '프로젝트명' 등. 상위 지원사업 이름(예: '2026년 창업도약패키지')과 구별하라. 과제명이 따로 없으면 가장 구체적인 사업명을 쓰고 note에 그렇게 했다고 적는다.
- program_name: 상위 지원사업명(예: '2026년 초기창업패키지', '중소기업 기술개발 지원사업', '지역혁신 선도연구센터'). 없으면 ''.
- agency: 주관·전담기관. 여러 기관이면 역할과 함께 '창업진흥원(전담) · 포항테크노파크(주관)'처럼 쓴다. 부처(중소벤처기업부 등)는 다른 기관이 없을 때만.
- description: 과제의 목적·내용을 1~3문장으로 요약.
- start_date / end_date: 협약(사업) 기간 'YYYY-MM-DD'. '2026. 5. 1. ~ 2026. 12. 31.' → 2026-05-01, 2026-12-31. 두 자리 연도는 20YY.
  - '협약일로부터 8개월'처럼 실제 날짜를 알 수 없으면 null로 두고 note에 원문을 적는다.
  - 다년도(연차) 과제는 이번 연차(현재 진행 중이거나 가장 최근) 기간을 쓰고 note에 전체 기간을 적는다.
- total_budget: 총사업비(원). 총사업비 = 정부지원금(출연금·보조금) + 기관(자기)부담금(현금 + 현물).
  - '총사업비'가 적혀 있으면 그 값. 정부지원금만 있으면 그것을 쓰고 note에 "정부지원금 기준"이라고 적는다.
- budget_items: 비목별 예산 [{name, amount}].
  - 예산표의 비목(인건비, 재료비, 외주용역비, 여비, 회의비, 연구활동비, 연구수당, 장비·기자재비, 지급수수료, 광고선전비, 교육훈련비, 지식재산권 비용 등)과 금액.
  - 세목까지 있으면 정산 단위인 비목 수준으로 묶는다.
  - 표에 '정부지원금 / 자기부담(현금) / 자기부담(현물) / 계' 열이 있으면 '계'(합계) 열 금액을 쓴다. '계' 열이 없으면 정부지원금 열을 쓰고 note에 적는다.
  - '합계', '총계', '소계', '계' 행은 비목이 아니니 넣지 마라. 금액을 모르는 비목은 amount null.

## 금액 단위 — 가장 흔한 실수
- 표 위·옆·아래의 '(단위: 천원)', '(단위: 백만원)', '(단위: 원)'을 반드시 확인하고 원 단위 정수로 바꿔라.
  - 천원 단위 150,000 → 150000000 / 백만원 단위 1,200 → 1200000000
- 쉼표·'원' 제거. '1.5억원' → 150000000, '5천만원' → 50000000, '3억 2천만원' → 320000000.
- 환산했으면 note에 "예산표 단위가 천원이라 원으로 환산함"처럼 적는다.
- 비목 합계가 총사업비와 다르면 note에 차이와 이유(현물 제외 등)를 적는다.

## 여러 과제·여러 자료
- 자료에 서로 다른 과제가 여러 개(예: 선정 공문의 과제 목록)면 projects에 각각 넣는다. 관리자 힌트가 특정 과제를 가리키면 그것만.
- 같은 과제에 대한 여러 자료(사업계획서 + 협약서 + 예산표)는 1건으로 합친다. 값이 서로 다르면 협약서(최종본) 값을 따르고 note에 적는다.
- 다른 기관의 과제만 나열된 공고문처럼 우리 과제를 특정할 수 없으면 projects를 비우고 warnings에 이유를 적는다.
- 사업 자료가 아니면 projects는 빈 배열, warnings에 이유.

## 확신도
- confidence: 과제명·기간·총사업비가 자료에 분명하면 high, 일부를 추정했으면 medium, 대부분 추정이면 low.
- note: 판단 근거와 애매한 점(한국어 1~3문장).
- warnings: 파일 전체에 관한 경고(읽을 수 없는 페이지, 스캔 품질, 잘린 표 등).

모든 문자열은 한국어로 쓴다(고유명사는 자료에 적힌 그대로).`

function normalizeProject(raw: RawProject): ProjectDraft | null {
  const noteParts: string[] = []
  const n = str(raw.note, 1000)
  if (n) noteParts.push(n)

  let start_date = normalizeDate(raw.start_date)
  let end_date = normalizeDate(raw.end_date)
  if (start_date && end_date && start_date > end_date) {
    noteParts.push("시작일이 종료일보다 늦게 읽혀 기간을 비웠습니다. 자료에서 기간을 확인해 입력하세요.")
    start_date = null
    end_date = null
  }

  const total = toWon(raw.total_budget)
  const byName = new Map<string, BudgetItem>()
  for (const b of Array.isArray(raw.budget_items) ? raw.budget_items : []) {
    const name = str(b?.name, 100)
    if (!name || /^(합\s*계|총\s*계|소\s*계|계)$/.test(name)) continue
    const amount = toWon(b?.amount)
    const prev = byName.get(name)
    if (prev) {
      // 같은 비목이 두 번 나오면(세목을 묶은 경우 등) 금액을 합친다.
      prev.amount = prev.amount !== null && amount !== null ? prev.amount + amount : (prev.amount ?? amount)
    } else {
      byName.set(name, { name, amount: amount !== null && amount >= 0 ? amount : null })
    }
  }
  const budget_items = [...byName.values()].slice(0, 50)

  const draft: ProjectDraft = {
    name: str(raw.name, 200),
    program_name: str(raw.program_name, 200),
    agency: str(raw.agency, 200),
    description: str(raw.description, 5000),
    start_date,
    end_date,
    total_budget: total !== null && total >= 0 ? total : null,
    budget_items,
    confidence: asConfidence(raw.confidence),
    note: noteParts.join(" "),
  }
  if (!draft.name && !draft.program_name && draft.total_budget === null && draft.budget_items.length === 0) return null
  if (!draft.name) draft.note = `${draft.note ? `${draft.note} ` : ""}프로젝트명을 찾지 못했습니다 — 직접 입력하세요.`.trim()
  return draft
}

export async function analyzeProjectDocs(
  inputs: AiInput[],
  hint: string,
): Promise<{ drafts: ProjectDraft[]; warnings: string[] }> {
  if (inputs.length === 0) throw new ExpenseAiError("분석할 자료가 없습니다.", 400)
  const content = inputContent(inputs, "자료")
  const h = hint.trim().slice(0, 1000)
  content.push({
    type: "input_text",
    text: [
      `오늘 날짜(한국): ${kstToday()}`,
      h ? `관리자 힌트: ${h}` : "",
      "위 사업 자료에서 우리 기관이 수행하는 프로젝트(과제) 정보를 뽑아라.",
    ]
      .filter(Boolean)
      .join("\n"),
  })

  const result = await callStructured<{ projects: RawProject[]; warnings: string[] }>({
    system: PROJECT_SYSTEM,
    content,
    schemaName: "expense_project_drafts",
    schema: PROJECT_SCHEMA as unknown as Record<string, unknown>,
    what: "사업 자료 분석",
    // 여러 문서를 한 번에 읽어 오래 걸릴 수 있다 — 재시도 대신 한 번에 넉넉히 기다린다.
    timeoutMs: 270_000,
    maxRetries: 0,
  })

  const drafts = (Array.isArray(result.projects) ? result.projects : [])
    .map(normalizeProject)
    .filter((d): d is ProjectDraft => d !== null)
    .slice(0, 10)
  const warnings = (Array.isArray(result.warnings) ? result.warnings : [])
    .map((w) => str(w, 300))
    .filter(Boolean)
  if (drafts.length === 0) {
    warnings.push("자료에서 프로젝트 정보를 찾지 못했습니다. '직접 입력'으로 등록해 주세요.")
  }
  return { drafts, warnings }
}

// ── 증빙 OCR(영수증·카드전표·세금계산서·거래명세서·이체확인증) ─────────────────────────────
const RECEIPT_FIELD_KEYS = [
  "doc_type",
  "issue_date",
  "vendor_name",
  "vendor_biz_no",
  "supply_amount",
  "vat_amount",
  "total_amount",
  "payment_method",
  "approval_no",
  "items",
  "budget_item",
  "purpose",
  "memo",
] as const satisfies readonly (keyof ReceiptFields)[]

const nullableInt = (description: string) => ({ type: ["integer", "null"], description })
const nullableStr = (description: string) => ({ type: ["string", "null"], description })

const RECEIPT_SCHEMA = {
  type: "object",
  properties: {
    documents: {
      type: "array",
      description:
        "파일에서 찾은 지출 증빙. 서로 다른 거래 1건당 1개. 같은 거래를 증명하는 여러 문서(영수증+카드전표, 세금계산서+이체확인증)는 1개로 합친다. 증빙이 없으면 빈 배열.",
      items: {
        type: "object",
        properties: {
          location: { type: "string", description: "파일 안 위치(예: '2페이지', '사진 왼쪽 영수증'). 증빙이 1건이면 빈 문자열." },
          doc_type: {
            type: "string",
            enum: [...EXPENSE_DOC_TYPES],
            description: "receipt=영수증·현금영수증, card_slip=카드 매출전표, tax_invoice=세금계산서·계산서, invoice=거래명세서, transfer=이체확인증, other=기타",
          },
          issue_date: nullableStr("거래일자 YYYY-MM-DD. 두 자리 연도는 20YY. 읽을 수 없으면 null."),
          vendor_name: { type: "string", description: "판매자(공급자·가맹점) 상호. 세금계산서는 '공급자' 칸. 모르면 빈 문자열." },
          vendor_biz_no: nullableStr("판매자 사업자등록번호 10자리 'NNN-NN-NNNNN'. 법인등록번호·가맹점번호·전화번호와 혼동 금지. 모르면 null."),
          supply_amount: nullableInt("공급가액(과세물품가액). 문서에 따로 적혀 있을 때만. 계산해서 만들지 않는다."),
          vat_amount: nullableInt("부가세(세액). 합계에 이미 포함된 금액. 문서에 따로 적혀 있을 때만."),
          tax_free_amount: nullableInt("면세물품가액. 없으면 null."),
          service_charge: nullableInt("봉사료. 없으면 null."),
          total_amount: nullableInt("실제 결제된 최종 금액(할인 후 받을금액·승인금액·합계금액). '받은금액(현금 투입액)' 아님."),
          payment_method: { type: "string", enum: [...PAYMENT_METHODS], description: "card=카드, cash=현금·현금영수증, transfer=계좌이체, other=모름·기타" },
          approval_no: nullableStr("카드 승인번호·현금영수증 승인번호·세금계산서 국세청 승인번호. 거래번호·가맹점번호 아님. 없으면 null."),
          card_info: nullableStr("카드사와 마스킹된 카드번호 끝자리(예: '신한카드 ****1234'). 카드 결제가 아니면 null."),
          items: {
            type: "array",
            description: "품목(보이는 줄만, 최대 30줄). 할인은 음수 금액 품목. 없거나 읽을 수 없으면 빈 배열.",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                quantity: { type: ["number", "null"] },
                unit_price: { type: ["integer", "null"] },
                amount: { type: ["integer", "null"] },
              },
              required: ["name", "quantity", "unit_price", "amount"],
              additionalProperties: false,
            },
          },
          budget_item: { type: "string", description: "제안 비목. 프로젝트 비목 목록에 맞는 것이 있으면 그 이름 그대로." },
          purpose: { type: "string", description: "적요: 무엇을 샀는지 한 줄(문서에 보이는 사실만)." },
          suggested_project_id: nullableInt("등록된 프로젝트 목록의 id 중 근거가 분명한 것. 근거가 약하면 null."),
          project_reason: { type: "string", description: "프로젝트를 고른 근거 한 문장. null이면 빈 문자열." },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          low_confidence_fields: {
            type: "array",
            description: "사람이 꼭 확인해야 하는 칸(흐림·잘림·손글씨·추정·후보 여럿).",
            items: { type: "string", enum: [...RECEIPT_FIELD_KEYS] },
          },
          warnings: { type: "array", description: "이 증빙에 대해 사람이 알아야 할 점(한국어, 짧게).", items: { type: "string" } },
        },
        required: [
          "location",
          "doc_type",
          "issue_date",
          "vendor_name",
          "vendor_biz_no",
          "supply_amount",
          "vat_amount",
          "tax_free_amount",
          "service_charge",
          "total_amount",
          "payment_method",
          "approval_no",
          "card_info",
          "items",
          "budget_item",
          "purpose",
          "suggested_project_id",
          "project_reason",
          "confidence",
          "low_confidence_fields",
          "warnings",
        ],
        additionalProperties: false,
      },
    },
    file_warnings: {
      type: "array",
      description: "파일 전체에 관한 경고(흐림, 일부 잘림, 증빙이 아님 등). 한국어. 없으면 빈 배열.",
      items: { type: "string" },
    },
  },
  required: ["documents", "file_warnings"],
  additionalProperties: false,
} as const

interface RawReceipt {
  location: string
  doc_type: string
  issue_date: string | null
  vendor_name: string
  vendor_biz_no: string | null
  supply_amount: number | null
  vat_amount: number | null
  tax_free_amount: number | null
  service_charge: number | null
  total_amount: number | null
  payment_method: string
  approval_no: string | null
  card_info: string | null
  items: { name: string; quantity: number | null; unit_price: number | null; amount: number | null }[]
  budget_item: string
  purpose: string
  suggested_project_id: number | null
  project_reason: string
  confidence: string
  low_confidence_fields: string[]
  warnings: string[]
}

const RECEIPT_SYSTEM = `너는 한국 지원사업(R&D 과제, 창업사업화 등) 사업비 정산 담당자를 돕는 증빙 판독 보조원이다.
관리자가 올린 파일(사진 또는 PDF)에서 지출 증빙을 찾아, 증빙마다 거래 정보를 구조화해 돌려준다.
결과는 '제안값'이다. 관리자가 표에서 확인·수정한 뒤에만 저장된다. 그러니 읽을 수 없는 값은 지어내지 말고 비워 두고(문자열 '' 또는 null, 숫자 null) low_confidence_fields에 넣어라. 틀린 값을 자신 있게 채우는 것이 빈칸보다 훨씬 나쁘다.

## 1. 증빙을 몇 건으로 나눌까
- 서로 다른 거래(거래처·날짜·금액이 다름)는 각각 1건. 한 사진에 영수증 여러 장을 찍었거나, PDF 페이지마다 다른 영수증이 있으면 모두 따로 뽑는다.
- 같은 거래를 증명하는 서로 다른 문서는 1건으로 합친다(이중 계상 방지). 예: POS 영수증 + 같은 금액 카드 매출전표, 세금계산서 + 이체확인증, 거래명세서 + 카드전표.
  - 합친 건의 doc_type은 가장 강한 증빙: 세금계산서(tax_invoice) > 카드 매출전표(card_slip) > 영수증·현금영수증(receipt) > 이체확인증(transfer) > 거래명세서(invoice).
  - 공급가액·부가세는 세금계산서에서, 결제수단은 카드전표·이체확인증에서 가져온다. warnings에 "세금계산서와 이체확인증을 한 건으로 합쳤습니다"처럼 적는다.
- 같은 영수증의 사본·재출력본, 여러 페이지에 걸친 한 문서는 1건.
- location에는 파일 안 위치('2페이지', '사진 오른쪽 위 영수증')를 적는다. 증빙이 1건이면 ''.
- 증빙이 아닌 파일(풍경·사람 사진, 명함, 메신저 대화 캡처, 빈 페이지)이면 documents는 빈 배열, file_warnings에 이유를 적는다.
- 견적서·발주서·주문서(결제 전 문서)는 doc_type 'other'로 뽑고 warnings에 "견적서는 지출 증빙이 아닙니다. 세금계산서·카드전표 등 실제 결제 증빙을 올려 주세요"를 적는다.

## 2. 문서 종류(doc_type) 알아보기
- card_slip(카드 매출전표·신용카드 영수증): 카드종류, 마스킹된 카드번호(예: 5310-12**-****-3456), 승인번호, 승인일시, 할부, 가맹점번호가 있다.
  - 식당·편의점 POS 영수증 아래에 카드 승인 정보가 함께 찍혀 있으면 card_slip. 온라인 결제의 '카드 매출전표' 화면 캡처도 card_slip.
- receipt(영수증): 카드 승인 정보가 없는 POS 영수증, 손으로 쓴 간이영수증('영수증(공급받는자용)', '일금 오만원정'), 현금영수증(국세청 승인번호, '지출증빙'/'소득공제' 표시).
  - 현금영수증은 payment_method 'cash', 현금영수증 승인번호를 approval_no에 넣는다.
  - 한글 금액('일금 오만삼천원정')은 숫자로 바꾼다(53000).
- tax_invoice(세금계산서·계산서): '전자세금계산서', 공급자/공급받는자 두 칸, 작성일자, 공급가액·세액·합계금액, 국세청 승인번호(예: 20260928-41000012-1a2b3c4d처럼 24자리 안팎)가 있다. '영수'/'청구' 표시가 있다.
  - '계산서'(면세, 세액 칸 없음)는 vat_amount 0, supply_amount = 합계, warnings에 "면세 계산서".
- invoice(거래명세서·거래명세표·납품서): 품목·규격·수량·단가 목록이 중심이고 결제 정보가 없다.
  - warnings에 "거래명세서만으로는 결제 증빙이 되지 않는 경우가 많습니다. 세금계산서·카드전표·이체확인증도 함께 챙기세요"를 적는다.
- transfer(이체확인증·송금확인증·인터넷뱅킹 이체 결과 화면): 출금계좌, 입금은행·입금계좌, 받는 분(예금주), 이체금액, 수수료, 이체일시가 있다.
  - vendor_name = 받는 분(예금주 이름·상호). total_amount = 이체금액(수수료 제외; 수수료가 있으면 warnings에 "이체 수수료 500원 별도").
  - supply_amount·vat_amount는 null, payment_method 'transfer', approval_no는 거래번호가 있으면 그것 아니면 null. 사업자번호는 대개 없다 → null.
  - '받는 분 통장 표시', '메모'에 적힌 내용은 purpose와 프로젝트 추정의 근거가 된다.
- other: 위에 해당하지 않는 것(견적서, 해외 인보이스, 항공권 e-티켓 확인서 등).

## 3. 금액 — 가장 흔한 실수들
모든 금액은 원 단위 정수다(쉼표·'원'·'₩'·'\\' 제거; '12,000' → 12000). 칸마다 한 자리씩 적힌 종이 세금계산서는 자릿수를 세어 읽고 '공란수'로 확인한다.
- total_amount = 실제로 결제(지급)된 최종 금액.
  - POS 영수증: '합계/총액/판매금액' 아래에 '할인/쿠폰/포인트 사용'이 있으면 할인 후 '받을금액/결제금액/청구금액/승인금액'이 total이다.
  - '받은금액/받은돈/현금/투입금액'은 손님이 낸 돈이라 거스름돈만큼 크다 — total이 아니다. '거스름돈/잔돈'도 무시한다.
  - 카드전표: '합계' 또는 '승인금액'. 카드전표의 '금액' 칸은 공급가액인 경우가 많다.
  - 세금계산서: '합계금액'(= 공급가액 + 세액).
  - 포인트·상품권·쿠폰으로 일부를 냈으면 total은 할인·포인트 차감 후 실제 결제액으로 하고, warnings에 결제수단별 금액("카드 8,000원 + 포인트 2,000원")을 적는다.
- 부가세(vat_amount)
  - POS 영수증·카드전표의 '부가세/부가세액/세액'은 합계에 이미 포함된 금액이다. 합계에 다시 더하지 마라. 이때 supply_amount는 '과세물품가액/공급가액/과세금액/금액'.
  - 부가세가 따로 적혀 있지 않은 영수증(간이영수증, 간이과세자·노점·일부 택시 영수증)은 supply_amount와 vat_amount를 null로 둔다. 합계÷1.1 같은 계산으로 만들어 넣지 마라.
  - '부가세 포함'이라는 말만 있고 금액이 없으면 null.
- 면세: '면세물품가액/면세금액'은 tax_free_amount에 넣고 공급가액에 섞지 마라. 과세·면세 혼합이면 supply + vat + tax_free = total.
- 봉사료: '봉사료'는 service_charge에. 봉사료는 공급가액·부가세에 들어가지 않고 total에만 포함된다.
- 할인: total은 할인 후 금액. 할인 줄은 items에 음수 금액 품목('할인', -3000)으로 넣는다.
- 취소 전표('취소', '승인취소', '반품', '환불'): 금액을 음수로 하고 warnings에 "취소(환불) 전표입니다", confidence는 low.
- 외화 결제: 원화 청구 금액이 적혀 있으면 그것을 total로. 원화 금액이 없으면 total null, warnings에 외화 금액·통화를 적는다.
- 할부 개월수, 카드 유효기간, 잔여·적립 포인트, 전화번호, 수량은 금액이 아니다.

## 4. 거래일자(issue_date) — 'YYYY-MM-DD'
- 거래일자 = 카드 '승인일시/거래일시', 영수증 '판매일/거래일자', 세금계산서 '작성일자', 이체확인증 '이체일시/처리일시'. 재출력·조회·출력 일시가 따로 있으면 실제 거래 일시를 쓴다.
- 한국 영수증의 두 자리 연도: '26.09.28', '26-09-28', '26/09/28'은 YY.MM.DD 순서다 → 2026-09-28. 두 자리 연도는 항상 20YY.
- '2026.9.28', '2026년 9월 28일', '2026/09/28 14:03:22'는 모두 2026-09-28. 시간은 버린다.
- 카드번호 근처의 'MM/YY'(유효기간)는 날짜가 아니다.
- 연도 없는 날짜('09/28')는 오늘 날짜 기준으로 가장 가까운 과거 연도로 채우고 low_confidence_fields에 issue_date를 넣는다.
- 오늘보다 미래 날짜가 나오면 잘못 읽었을 가능성이 크다. 다시 확인하고, 그래도 그렇다면 low_confidence_fields에 넣는다.

## 5. 거래처(vendor_name)와 사업자등록번호(vendor_biz_no)
- vendor_name = 판매자(공급자·가맹점) 상호. 지점명까지 쓴다('스타벅스 포항공대점'). '(주)', '주식회사'는 보이는 대로.
- 세금계산서는 반드시 '공급자' 칸(보통 왼쪽 또는 위)의 상호·등록번호를 쓴다. '공급받는자' 칸은 우리 기관(구매자)이다 — 절대 거래처로 쓰지 마라.
- 카드전표 가맹점명이 결제대행사(KG이니시스, NHN KCP, 나이스페이먼츠, 토스페이먼츠, 다날 등)나 오픈마켓('쿠팡(주)', '네이버파이낸셜')이면 그대로 쓰되, 실제 판매자가 보이면 warnings에 적는다.
- 사업자등록번호는 10자리 'NNN-NN-NNNNN'. POS 영수증은 상호 바로 아래 '사업자번호/사업자등록번호/등록번호' 줄, 카드전표는 가맹점 정보란, 세금계산서는 공급자 '등록번호' 칸에 있다.
  - 헷갈리기 쉬운 번호: 법인등록번호(13자리 NNNNNN-NNNNNNN), 가맹점번호, 단말기번호(TID/CAT ID), 전화번호, 카드번호, 승인번호, 종사업장번호. 이것들을 사업자번호로 쓰지 마라.
  - 10자리를 확실히 읽지 못했으면 null로 두고 low_confidence_fields에 넣는다.

## 6. 결제수단(payment_method)·승인번호(approval_no)·카드 정보(card_info)
- 카드 결제 흔적(카드번호, '신용/체크', '승인') → 'card'. 현금·현금영수증 → 'cash'. 계좌이체·무통장입금 → 'transfer'. 모르면 'other'로 두고 low_confidence_fields에 payment_method.
- 결제수단이 적혀 있지 않은 손글씨·간이영수증('영수함'만 있는 것)은 보통 현금 결제이므로 'cash'로 두되, 추정이므로 반드시 low_confidence_fields에 payment_method를 넣는다.
- 결제수단을 문서에서 직접 확인하지 못하고 추정했다면(어느 값이든) low_confidence_fields에 payment_method를 넣는다.
- 세금계산서만 있고 결제 흔적이 없으면 보통 계좌이체이므로 'transfer'로 두고 low_confidence_fields에 payment_method를 넣는다.
- approval_no: 카드 '승인번호'(대개 8자리 숫자), 현금영수증 승인번호, 세금계산서 국세청 승인번호. 거래번호·영수증번호·POS번호·가맹점번호와 헷갈리지 마라. 없으면 null.
- card_info: 카드사·카드 종류와 마스킹된 카드번호 끝자리('신한카드 ****1234', 'KB국민 체크 ****5678'). 카드 결제가 아니면 null.

## 7. 품목(items)
- 품명·수량·단가·금액. 보이는 줄만 옮긴다. 과세·면세 표시 기호(*, #)는 품명에서 뺀다.
- 30줄이 넘으면 앞의 30줄만 넣고 warnings에 "품목이 많아 일부만 옮겼습니다".
- 품목을 읽을 수 없으면 빈 배열.

## 8. 비목(budget_item)·적요(purpose)
- budget_item은 지출 성격에 가장 알맞은 비목 이름이다. 추정한 프로젝트(없으면 전체 프로젝트)의 비목 목록에 알맞은 것이 있으면 그 이름을 글자 그대로 쓴다. 맞는 것이 없거나 목록이 비어 있으면 일반적인 비목명을 쓴다.
  - 일반적 대응: 식당·카페·다과 → 회의비 / 사무용품·소모품·부품·원재료 → 재료비 / 택시·KTX·항공·주유·통행료·숙박 → 여비 / 디자인·개발·인쇄·제작 외주 → 외주용역비 / SW 구독·클라우드·도메인·각종 수수료·택배 → 지급수수료 / 광고·홍보물 → 광고선전비 / 장비·기자재 → 장비비 / 교육·세미나 등록비 → 교육훈련비 / 특허 출원·등록 → 지식재산권 비용.
  - 두 비목이 비슷하게 그럴듯하면 low_confidence_fields에 budget_item.
- purpose(적요)는 무엇을 샀는지 한 줄: 'A4 용지 외 2건 구입', '회의 다과 구입', '포항→서울 KTX 승차권'. 문서에 보이는 사실만 쓰고 회의 이름·참석자 등 문서에 없는 내용은 지어내지 마라.

## 9. 프로젝트 추정(suggested_project_id)
- 관리자가 준 '등록된 프로젝트 목록'의 id 중에서만 고른다. 목록에 없는 id를 만들지 마라. 목록이 비어 있으면 null.
- 문서에 프로젝트명·과제명·사업명·과제번호가 적혀 있거나(비고·메모·송금 메모 포함), 품목이 특정 프로젝트 성격과 뚜렷하게 맞을 때만 고른다.
- 거래일자가 어떤 프로젝트 기간 밖이면 그 프로젝트는 고르지 마라. 기간만 맞는다는 이유로는 고르지 마라.
- 근거가 약하면 null. project_reason에 근거를 한 문장으로('송금 메모에 "스마트팜 과제"가 적혀 있음'), null이면 ''.

## 10. 확신도·확인 필요 칸
- confidence: 핵심 칸(거래일자·거래처·합계)이 모두 선명하면 high, 하나라도 애매하면 medium, 여러 칸이 흐리거나 잘렸으면 low.
- low_confidence_fields: 흐림·잘림·손글씨·접힘·빛 반사로 확실하지 않은 칸, 추정으로 채운 칸, 후보가 여럿이었던 칸만. 선명하게 읽은 칸은 넣지 마라.
- warnings: 이 증빙에 대해 사람이 꼭 알아야 할 점(짧게). file_warnings: 파일 전체에 관한 것(흐림, 일부 잘림, 증빙이 아님 등).

모든 설명 문장은 한국어로 쓴다(상호·품명은 문서에 적힌 그대로).`

// 파일 1개에서 표로 올리는 증빙 최대 건수(넘으면 파일 경고로 알린다 — 조용히 버리지 않는다)
export const MAX_RECEIPTS_PER_FILE = 30

export interface ReceiptScanProject {
  id: number
  name: string
  program_name: string
  budget_items: string[] // 비목 이름
  start_date?: string | null // 'YYYY-MM-DD' — 기간 밖 거래를 추천하지 않도록 참고용
  end_date?: string | null
}

function isFieldKey(v: unknown): v is (typeof RECEIPT_FIELD_KEYS)[number] {
  return typeof v === "string" && (RECEIPT_FIELD_KEYS as readonly string[]).includes(v)
}

function projectListText(projects: ReceiptScanProject[]): string {
  if (projects.length === 0) return "[등록된 프로젝트 목록]\n(없음 — suggested_project_id는 null)"
  const lines = projects.slice(0, 50).map((p) => {
    const parts = [`id=${p.id}`, `프로젝트: ${p.name}`]
    if (p.program_name) parts.push(`지원사업: ${p.program_name}`)
    if (p.start_date || p.end_date) parts.push(`기간: ${p.start_date ?? "?"} ~ ${p.end_date ?? "?"}`)
    parts.push(`비목: ${p.budget_items.length > 0 ? p.budget_items.join(", ") : "(미등록)"}`)
    return `- ${parts.join(" | ")}`
  })
  return `[등록된 프로젝트 목록]\n${lines.join("\n")}`
}

function normalizeReceipt(
  raw: RawReceipt,
  projects: ReceiptScanProject[],
  today: string,
  pos: { index: number; count: number },
): ReceiptDraft {
  const low = new Set<keyof ReceiptFields>((Array.isArray(raw.low_confidence_fields) ? raw.low_confidence_fields : []).filter(isFieldKey))
  const warnings: string[] = []
  if (pos.count > 1) {
    const loc = str(raw.location, 60)
    warnings.push(`이 파일 속 증빙 ${pos.index + 1}/${pos.count}${loc ? ` (${loc})` : ""}`)
  }
  for (const w of Array.isArray(raw.warnings) ? raw.warnings : []) {
    const t = str(w, 300)
    if (t) warnings.push(t)
  }

  const doc_type: ExpenseDocType = (EXPENSE_DOC_TYPES as readonly string[]).includes(raw.doc_type)
    ? (raw.doc_type as ExpenseDocType)
    : "other"

  const issue_date = normalizeDate(raw.issue_date) ?? ""
  if (!issue_date) low.add("issue_date")
  else if (issue_date > today) {
    low.add("issue_date")
    warnings.push("거래일자가 오늘 이후로 읽혔습니다. 날짜를 확인하세요.")
  }

  const vendor_name = str(raw.vendor_name, 200)
  if (!vendor_name) low.add("vendor_name")

  // 사업자번호: 10자리일 때만 채우고, 검증 숫자가 틀리면 한 자리 오독 가능성을 알린다.
  const bizDigits = (typeof raw.vendor_biz_no === "string" ? raw.vendor_biz_no : "").replace(/\D/g, "")
  let vendor_biz_no = ""
  if (bizDigits.length === 10) {
    vendor_biz_no = `${bizDigits.slice(0, 3)}-${bizDigits.slice(3, 5)}-${bizDigits.slice(5)}`
    if (!isValidBizNoChecksum(bizDigits)) {
      low.add("vendor_biz_no")
      warnings.push("사업자등록번호의 검증 숫자가 맞지 않습니다. 한 자리가 잘못 읽혔을 수 있으니 원본과 대조하세요.")
    }
  } else if (bizDigits.length > 0) {
    low.add("vendor_biz_no")
    warnings.push("사업자등록번호를 10자리로 읽지 못해 비워 두었습니다.")
  }

  const supply_amount = toWon(raw.supply_amount)
  const vat_amount = toWon(raw.vat_amount)
  const total_amount = toWon(raw.total_amount)
  const taxFree = toWon(raw.tax_free_amount)
  const service = toWon(raw.service_charge)
  if (total_amount === null) low.add("total_amount")
  if (taxFree) warnings.push(`면세 금액 ${formatWon(taxFree)}이 합계에 포함돼 있어 공급가액+부가세가 합계와 다를 수 있습니다.`)
  if (service) warnings.push(`봉사료 ${formatWon(service)}이 합계에 포함돼 있습니다.`)
  if (supply_amount !== null && vat_amount !== null && total_amount !== null) {
    const unexplained = total_amount - supply_amount - vat_amount - (taxFree ?? 0) - (service ?? 0)
    if (unexplained !== 0) {
      low.add("supply_amount")
      low.add("vat_amount")
      low.add("total_amount")
    }
  } else if ((supply_amount === null) !== (vat_amount === null)) {
    low.add(supply_amount === null ? "supply_amount" : "vat_amount")
  }

  const payment_method: PaymentMethod = (PAYMENT_METHODS as readonly string[]).includes(raw.payment_method)
    ? (raw.payment_method as PaymentMethod)
    : "other"
  if (payment_method === "other") low.add("payment_method")

  const items: ReceiptItem[] = (Array.isArray(raw.items) ? raw.items : []).slice(0, 50).map((it) => ({
    name: str(it?.name, 200),
    quantity: typeof it?.quantity === "number" && Number.isFinite(it.quantity) ? it.quantity : null,
    unit_price: toWon(it?.unit_price),
    amount: toWon(it?.amount),
  }))

  const cardInfo = str(raw.card_info, 100)

  // 추천 프로젝트는 등록된 활성 프로젝트 id이고, 거래일이 그 기간 안일 때만 남긴다.
  let suggested_project_id: number | null = null
  const sid = typeof raw.suggested_project_id === "number" ? raw.suggested_project_id : null
  const proj = sid !== null ? projects.find((p) => p.id === sid) : undefined
  if (proj) {
    const outside =
      !!issue_date && ((!!proj.start_date && issue_date < proj.start_date) || (!!proj.end_date && issue_date > proj.end_date))
    if (!outside) suggested_project_id = proj.id
  }

  return {
    doc_type,
    issue_date,
    vendor_name,
    vendor_biz_no,
    supply_amount,
    vat_amount,
    total_amount,
    payment_method,
    approval_no: str(raw.approval_no, 50),
    items,
    budget_item: str(raw.budget_item, 100),
    purpose: str(raw.purpose, 500),
    memo: cardInfo ? `결제 카드: ${cardInfo}` : "",
    suggested_project_id,
    project_reason: suggested_project_id !== null ? str(raw.project_reason, 300) : "",
    confidence: asConfidence(raw.confidence),
    low_confidence_fields: RECEIPT_FIELD_KEYS.filter((k) => low.has(k)),
    warnings: [...new Set(warnings)].slice(0, 12),
  }
}

// 파일 한 개(이미지 1장 또는 PDF 1개)를 판독한다. 증빙이 여러 장이면 초안도 여러 개.
// warnings는 파일 전체에 대한 경고(흐림·증빙 아님 등)다. drafts가 비어 있을 수 있다.
export async function scanReceipt(
  input: AiInput,
  ctx: { projects: ReceiptScanProject[] },
): Promise<{ drafts: ReceiptDraft[]; warnings: string[] }> {
  const today = kstToday()
  const content = inputContent([input], "파일")
  content.push({
    type: "input_text",
    text: [
      `오늘 날짜(한국): ${today}`,
      projectListText(ctx.projects),
      "위 파일에서 지출 증빙을 모두 찾아 판독하라.",
    ].join("\n\n"),
  })

  const result = await callStructured<{ documents: RawReceipt[]; file_warnings: string[] }>({
    system: RECEIPT_SYSTEM,
    content,
    schemaName: "expense_receipt_scan",
    schema: RECEIPT_SCHEMA as unknown as Record<string, unknown>,
    what: "증빙 판독",
    // 증빙 1개는 보통 1분 안에 끝난다. 일시 오류(429·5xx)는 한 번 더 시도한다.
    timeoutMs: 130_000,
    maxRetries: 1,
  })

  const all = Array.isArray(result.documents) ? result.documents : []
  const docs = all.slice(0, MAX_RECEIPTS_PER_FILE)
  // 위치 표시는 파일 속 실제 건수 기준("증빙 1/35")으로 해서, 표에 30행만 있어도 빠진 건이 있다는 걸 알 수 있게 한다.
  const drafts = docs.map((d, index) => normalizeReceipt(d, ctx.projects, today, { index, count: all.length }))
  const warnings = [
    ...new Set((Array.isArray(result.file_warnings) ? result.file_warnings : []).map((w) => str(w, 300)).filter(Boolean)),
  ]
  if (all.length > MAX_RECEIPTS_PER_FILE) {
    warnings.unshift(
      `이 파일에서 증빙 ${all.length}건을 찾았지만 앞의 ${MAX_RECEIPTS_PER_FILE}건만 표에 올렸습니다. 나머지 ${all.length - MAX_RECEIPTS_PER_FILE}건은 PDF를 나눠(예: ${MAX_RECEIPTS_PER_FILE}쪽씩) 다시 올려 주세요.`,
    )
  }
  return { drafts, warnings }
}
