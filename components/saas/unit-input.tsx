"use client"

// 단위 붙은 숫자 입력칸 — WonInput(원), UnitInput(평·원/평·원/월·kWh·%). 입력하는 동안 천 단위 쉼표를 보여 주고,
// 바깥으로는 "쉼표 없는 숫자 문자열" 또는 null(빈칸)을 내보낸다(값 계약: unit-input-model.ts, 테스트 tests/unit-input.test.ts).
// 빈칸을 0으로 바꾸지 않는다(가드 #12·#18). 붙여넣은 "1,234,000원"도 숫자만 읽는다.
//
// 사용 예:
//   const [deposit, setDeposit] = useState<string | null>(row.deposit_actual)     // NUMERIC 문자열 그대로 받아도 된다
//   <Label htmlFor="deposit">받은 보증금</Label>
//   <WonInput id="deposit" value={deposit} onChange={setDeposit} aria-describedby="deposit-hint" />
//   <UnitInput id="kwh" unit="kWh" value={kwh} onChange={setKwh} />               // 소수 1자리(63,048.3)
//   <UnitInput id="area" unit="평" value={pyeong} onChange={setPyeong} />         // 소수 1자리
//   <UnitInput id="price" unit="원/kWh" value={price} onChange={setPrice} />      // 소수 2자리(117.35)
// 포커스 외곽선은 바깥 틀(InputGroup)에 하나만 그린다(app/globals.css의 input-group 규칙).
//   API로 보낼 때: body: JSON.stringify({ deposit_actual: deposit })              // "8400000" 또는 null

import { useState, type ComponentProps } from "react"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { cn } from "@/lib/utils"
import { formatTyping, formatUnitValue, parseUnitValue, sanitizeUnitText } from "./unit-input-model"

export type Unit = "원" | "평" | "원/평" | "원/월" | "원/kWh" | "kWh" | "%"

const DEFAULT_DECIMALS: Record<Unit, number> = { "원": 0, "평": 1, "원/평": 0, "원/월": 0, "원/kWh": 2, kWh: 1, "%": 1 }

type BaseProps = Omit<ComponentProps<"input">, "value" | "onChange" | "type" | "defaultValue"> & {
  value: string | number | null | undefined
  onChange: (value: string | null) => void
  allowNegative?: boolean
  invalid?: boolean
  inputClassName?: string
}

function NumberWithUnit({
  unit,
  decimals,
  value,
  onChange,
  allowNegative = false,
  invalid = false,
  className,
  inputClassName,
  ...rest
}: BaseProps & { unit: string; decimals: number }) {
  const opts = { decimals, allowNegative }
  const normalized = value === null || value === undefined || value === "" ? null : parseUnitValue(String(value), opts)
  const [text, setText] = useState(() => formatUnitValue(normalized, decimals))
  const [prev, setPrev] = useState(normalized)
  // 바깥에서 값이 바뀌면(지난달 값 불러오기·자동 계산 등) 표시 글자도 맞춘다
  if (normalized !== prev) {
    setPrev(normalized)
    if (parseUnitValue(text, opts) !== normalized) setText(formatUnitValue(normalized, decimals))
  }
  return (
    <InputGroup className={cn("bg-card", className)}>
      <InputGroupInput
        {...rest}
        type="text"
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        value={text}
        onChange={(e) => {
          const clean = sanitizeUnitText(e.target.value, opts)
          setText(formatTyping(clean))
          const next = parseUnitValue(clean, opts)
          setPrev(next)
          onChange(next)
        }}
        onBlur={(e) => {
          // 입력을 마치면 끝의 "."·소수 끝 0을 정리해 보여 준다
          setText(formatUnitValue(parseUnitValue(text, opts), decimals))
          rest.onBlur?.(e)
        }}
        className={cn("text-right text-base tabular-nums", inputClassName)}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText className="text-[15px] text-[#3f3f4e]">{unit}</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
}

/** 원 단위 금액 입력(정수, 접미사 "원") */
export function WonInput(props: BaseProps) {
  return <NumberWithUnit unit="원" decimals={0} {...props} />
}

/** 단위 입력. decimals 기본: 평·kWh·% 1자리, 원/평·원/월 0자리, 원/kWh 2자리(단가 NUMERIC(8,2)) */
export function UnitInput({ unit, decimals, ...props }: BaseProps & { unit: Unit; decimals?: number }) {
  return <NumberWithUnit unit={unit} decimals={decimals ?? DEFAULT_DECIMALS[unit]} {...props} />
}
