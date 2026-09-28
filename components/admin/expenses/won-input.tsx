"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

// 원 단위 금액 입력칸. 입력하는 동안 천 단위 콤마를 붙여 보여 주고, 값은 정수(또는 null)로 돌려준다.
// "1,234,000", "1234000원" 같은 붙여넣기도 숫자만 골라 읽는다.

const MAX_DIGITS = 13

function format(v: number | null): string {
  return v === null ? "" : v.toLocaleString("ko-KR")
}

function parse(text: string, allowNegative: boolean): number | null {
  const intPart = text.split(".")[0] ?? ""
  const digits = intPart.replace(/\D/g, "").slice(0, MAX_DIGITS)
  if (!digits) return null
  const n = Number(digits)
  return allowNegative && intPart.trim().startsWith("-") ? -n : n
}

export function WonInput({
  value,
  onChange,
  allowNegative = false,
  suffix = "원",
  invalid = false,
  className,
  ...rest
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "defaultValue"> & {
  value: number | null
  onChange: (value: number | null) => void
  allowNegative?: boolean
  suffix?: string
  invalid?: boolean
}) {
  const [text, setText] = useState(() => format(value))
  const [prev, setPrev] = useState(value)
  // 바깥에서 값이 바뀌면(AI 제안 채우기, 합계 자동 계산 등) 표시 문자열도 맞춘다
  if (value !== prev) {
    setPrev(value)
    if (parse(text, allowNegative) !== value) setText(format(value))
  }

  return (
    <div className="relative">
      <Input
        {...rest}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-invalid={invalid || undefined}
        value={text}
        onChange={(e) => {
          const raw = e.target.value
          const n = parse(raw, allowNegative)
          setText(n === null ? (allowNegative && raw.trim() === "-" ? "-" : "") : format(n))
          onChange(n)
        }}
        className={cn("pr-8 text-right tabular-nums", className)}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-text-secondary">
          {suffix}
        </span>
      )}
    </div>
  )
}
