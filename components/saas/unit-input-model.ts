// 단위 입력칸(WonInput·UnitInput)의 값 계약 — 순수 함수(tests/unit-input.test.ts가 확인한다).
//   빈칸은 null(0이 아님) · 바깥으로 내보내는 값은 쉼표 없는 숫자 문자열("1234", "63048.3")
//   decimals만큼 소수를 지킨다(kWh 1자리). API의 num("1,234") = null 함정을 막는다.
//
// 사용 예:
//   parseUnitValue("1,234원")                 // "1234"
//   parseUnitValue("63,048.35", { decimals: 1 })  // "63048.3"  (넘치는 자리는 잘라 낸다 — 반올림하지 않는다)
//   parseUnitValue("")                         // null
//   formatUnitValue("63048.3", 1)              // "63,048.3"

export interface UnitParseOptions {
  /** 소수 자리수(기본 0 = 정수) */
  decimals?: number
  allowNegative?: boolean
  /** 정수부 최대 자리수(기본 13 = NUMERIC(12,0)보다 넉넉) */
  maxDigits?: number
}

function group(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/**
 * 입력 중인 글자를 정리한다(쉼표·단위·공백 제거, 소수점 하나, 소수 자리 제한, 앞의 0 정리).
 * 반환은 "쉼표 없는" 정리된 글자이며 끝의 "." 같은 입력 중 상태를 남긴다("63048." 그대로).
 */
export function sanitizeUnitText(text: string, opts: UnitParseOptions = {}): string {
  const decimals = opts.decimals ?? 0
  const maxDigits = opts.maxDigits ?? 13
  const raw = String(text ?? "").trim()
  const negative = !!opts.allowNegative && raw.startsWith("-")
  let body = raw.replace(/[^\d.]/g, "")
  if (decimals <= 0) {
    body = body.split(".")[0] ?? ""
  } else {
    const dot = body.indexOf(".")
    if (dot !== -1) body = body.slice(0, dot + 1) + body.slice(dot + 1).replace(/\./g, "").slice(0, decimals)
  }
  let [intPart, frac] = body.split(".") as [string, string | undefined]
  intPart = intPart.replace(/^0+(?=\d)/, "").slice(0, maxDigits)
  if (frac !== undefined && intPart === "") intPart = "0"
  const out = frac !== undefined ? `${intPart}.${frac}` : intPart
  return negative ? `-${out}` : out
}

/** 입력 글자 → 내보낼 값(쉼표 없는 숫자 문자열) 또는 null(빈칸·"-"·"."). 끝의 "."과 소수 끝 0은 지운다 */
export function parseUnitValue(text: string | null | undefined, opts: UnitParseOptions = {}): string | null {
  if (!/\d/.test(String(text ?? ""))) return null // 숫자가 하나도 없으면 빈칸("."·"-"·"원")
  const s = sanitizeUnitText(text ?? "", opts)
  const negative = s.startsWith("-")
  let body = negative ? s.slice(1) : s
  if (body === "" || body === ".") return null
  if (body.includes(".")) {
    body = body.replace(/0+$/, "").replace(/\.$/, "")
  }
  if (body === "") return null
  if (/^0(\.0*)?$/.test(body)) return "0"
  return negative ? `-${body}` : body
}

/** 값(숫자·숫자 문자열) → 화면 글자("1,234", "63,048.3"). null·숫자 아님 → "" */
export function formatUnitValue(value: string | number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || value === "") return ""
  const s = typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : value.replace(/,/g, "").trim()
  if (!/^-?\d+(\.\d+)?$/.test(s)) return ""
  const negative = s.startsWith("-")
  const [i, f] = (negative ? s.slice(1) : s).split(".")
  const frac = decimals > 0 && f ? f.slice(0, decimals) : ""
  const body = group(i.replace(/^0+(?=\d)/, "")) + (frac ? `.${frac}` : "")
  return negative ? `-${body}` : body
}

/** 입력 중 표시: 정수부에만 쉼표를 붙이고 소수점·소수부는 친 그대로 둔다("63048." → "63,048.") */
export function formatTyping(sanitized: string): string {
  const negative = sanitized.startsWith("-")
  const body = negative ? sanitized.slice(1) : sanitized
  const dot = body.indexOf(".")
  const intPart = dot === -1 ? body : body.slice(0, dot)
  const rest = dot === -1 ? "" : body.slice(dot)
  const out = group(intPart) + rest
  return negative ? `-${out}` : out
}
