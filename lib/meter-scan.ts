// 계량기 사진·한전 고지서 사진을 OpenAI vision으로 판독하는 순수 로직.
// 판독 결과는 "제안"일 뿐이며, 저장은 관리자가 화면에서 확인·수정한 뒤에만 이루어진다.
// Responses API + strict JSON Schema를 쓴다(프로젝트가 zod v3이라 SDK의 zod 헬퍼는 쓰지 않는다).

import OpenAI from "openai"

// meters 테이블의 code와 일치해야 한다.
export const METER_CODES = ["MAIN", "F101", "F103", "HVAC"] as const
export type MeterCode = (typeof METER_CODES)[number]

export const METER_LABELS: Record<MeterCode, string> = {
  MAIN: "공장동 전체(주계량기)",
  F101: "F101호",
  F103: "F103호",
  HVAC: "냉난방기(F101·F103 공용)",
}

// 숫자 한 자리 오독이 곧 청구 금액 오류이므로 플래그십 모델을 기본으로 쓴다.
// 비용을 낮추려면 OPENAI_MODEL로 gpt-5.6-terra / gpt-5.6-luna를 지정할 수 있다.
const DEFAULT_MODEL = "gpt-5.6-sol"

// strict 모드 제약: 모든 property가 required에 있어야 하고 additionalProperties:false여야 한다.
// 널 허용은 type 배열(["object","null"])로 표현한다.
const SCAN_SCHEMA = {
  type: "object",
  properties: {
    meters: {
      type: "array",
      description: "사진에서 읽어낸 계량기 지침. 계량기가 없으면 빈 배열.",
      items: {
        type: "object",
        properties: {
          code: {
            type: "string",
            enum: ["MAIN", "F101", "F103", "HVAC"],
            description: "이 사진이 어느 계량기인지. 확실하지 않으면 이 항목을 만들지 마라.",
          },
          reading: {
            type: "number",
            description: "계량기에 표시된 누적 지침(정수). 소수점 이하 자리는 버린다.",
          },
          image_index: { type: "number", description: "몇 번째 이미지에서 읽었는지(0부터)" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          note: { type: "string", description: "판독 근거 또는 애매했던 점. 한국어 한 문장." },
        },
        required: ["code", "reading", "image_index", "confidence", "note"],
        additionalProperties: false,
      },
    },
    kepco: {
      type: ["object", "null"],
      description: "한전 전기요금 고지서를 찍은 사진이 있으면 그 내용. 없으면 null.",
      properties: {
        total_amount: { type: "number", description: "한전 청구서의 청구금액(원, 정수)" },
        period: { type: "string", description: "사용월 'YYYY-MM'. 알 수 없으면 빈 문자열." },
        image_index: { type: "number" },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        note: { type: "string" },
      },
      required: ["total_amount", "period", "image_index", "confidence", "note"],
      additionalProperties: false,
    },
    warnings: {
      type: "array",
      description: "읽을 수 없었거나 사람이 반드시 확인해야 하는 점. 한국어. 없으면 빈 배열.",
      items: { type: "string" },
    },
  },
  required: ["meters", "kepco", "warnings"],
  additionalProperties: false,
} as const

export interface ScanMeterRow {
  code: MeterCode
  reading: number
  image_index: number
  confidence: "high" | "medium" | "low"
  note: string
}

export interface ScanResult {
  meters: ScanMeterRow[]
  kepco: {
    total_amount: number
    period: string
    image_index: number
    confidence: "high" | "medium" | "low"
    note: string
  } | null
  warnings: string[]
}

const SYSTEM = `너는 창업보육센터 관리비 정산 담당자를 돕는 판독 보조원이다.
관리자가 올린 사진에서 전기 계량기 지침과 한전 고지서 청구금액을 읽어낸다.

## 계량기 종류 (meters 테이블의 code)
- MAIN: 공장동 전체 주계량기. 공장동 전기 사용량 전부를 계량한다.
- F101: F101호 전용 계량기
- F103: F103호 전용 계량기
- HVAC: 냉난방기 계량기 (F101·F103 공용, '동력기'로 불리기도 한다)

사진 속 라벨·명판·손글씨 메모("F101", "동력", "냉난방", "메인" 등)를 근거로 종류를 판정하라.
관리자가 이미지 순서에 대해 알려준 힌트가 있으면 그것을 우선한다.

## 판독 규칙
- 지침은 누적값이다. 기계식 카운터는 마지막 빨간색 자리(소수 첫째 자리)를 **버리고** 정수부만 읽는다.
- 디지털 표시부는 kWh 표시값 정수부를 읽는다.
- 숫자 하나라도 확실하지 않으면 confidence를 low로 내리고 note에 어느 자리가 애매한지 적어라.
- **절대 추측해서 지어내지 마라.** 읽을 수 없으면 그 계량기를 meters 배열에 넣지 말고 warnings에 이유를 적어라.
- 같은 계량기가 여러 장에 있으면 가장 선명한 한 장만 사용한다.

## 한전 고지서
- '청구금액'(부가세·기금 포함 최종 금액)을 원 단위 정수로 읽는다. '사용량'이나 '전력량요금'이 아니다.
- 사용월이 적혀 있으면 'YYYY-MM'으로 준다.

모든 note와 warning은 한국어로 쓴다.`

export function hasApiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY)
}

export interface ScanImage {
  media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"
  data: string // base64
}

export async function scanMeterImages(images: ScanImage[], hint: string): Promise<ScanResult> {
  const client = new OpenAI()

  const content: OpenAI.Responses.ResponseInputContent[] = []
  images.forEach((img, i) => {
    content.push({ type: "input_text", text: `[이미지 ${i}]` })
    content.push({
      type: "input_image",
      image_url: `data:${img.media_type};base64,${img.data}`,
      detail: "high", // 계량기 숫자는 작아서 저해상도로는 자릿수를 놓친다
    })
  })
  content.push({
    type: "input_text",
    text: hint.trim()
      ? `관리자 힌트: ${hint.trim()}\n\n위 사진들에서 계량기 지침과 한전 청구금액을 판독하라.`
      : "위 사진들에서 계량기 지침과 한전 청구금액을 판독하라.",
  })

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    input: [
      { role: "system", content: SYSTEM },
      { role: "user", content },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "meter_scan",
        strict: true,
        schema: SCAN_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  })

  // 안전장치로 거절되거나 토큰 한도로 잘리면 output_text가 비거나 JSON이 아니다.
  const raw = response.output_text
  if (!raw) {
    throw new Error("판독 결과가 비어 있습니다. 사진이 선명한지 확인하고 다시 시도해 주세요.")
  }
  try {
    return JSON.parse(raw) as ScanResult
  } catch {
    throw new Error("판독 결과를 해석하지 못했습니다. 사진이 선명한지 확인하고 다시 시도해 주세요.")
  }
}
