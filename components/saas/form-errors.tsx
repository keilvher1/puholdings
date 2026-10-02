"use client"

// 제출 때 한 번에 검증하는 폼 오류 — 칸 아래 오류(FieldError) + 2개 이상이면 폼 맨 위 오류 요약(ErrorSummary).
// 첫 오류 칸으로 포커스를 옮기고, 입력값은 지우지 않는다. 필수값이 비어도 제출 버튼은 켜 둔다.
//
// 사용 예:
//   const fe = useFieldErrors({ name: "기업 이름", start: "입주일", deposit: "받은 보증금" })
//   const submit = async () => {
//     if (!fe.check({ name: !name && "기업 이름을 입력해 주세요", start: !start && "입주일을 골라 주세요" })) return
//     const res = await save()
//     if (res.field_errors) return fe.setErrors(res.field_errors)        // 서버 칸 오류도 같은 자리에
//   }
//   <ErrorSummary errors={fe.summary} />
//   <Input {...fe.field("name")} value={name} onChange={…} />            // id·aria-invalid·aria-describedby
//   <FieldError id={fe.errorId("name")}>{fe.errors.name}</FieldError>      // components/ui/field
//
// 칸 id는 fe.field(key).id(= "f-<key>")를 쓴다. ErrorSummary의 링크가 그 칸으로 포커스를 옮긴다.

import { useCallback, useMemo, useState } from "react"
import { CircleAlert } from "lucide-react"
import { cn } from "@/lib/utils"

export interface FieldErrorItem {
  field: string
  label: string
  message: string
}

const fieldId = (key: string) => `f-${key}`
const errorId = (key: string) => `f-${key}-error`

function focusField(key: string) {
  if (typeof document === "undefined") return
  const el = document.getElementById(fieldId(key))
  if (el) {
    el.focus()
    el.scrollIntoView({ block: "center" })
  }
}

export function useFieldErrors<K extends string>(labels: Record<K, string>) {
  const [errors, setErrorsState] = useState<Partial<Record<K, string>>>({})
  const labelKey = JSON.stringify(labels)

  const summary = useMemo<FieldErrorItem[]>(() => {
    const l = JSON.parse(labelKey) as Record<string, string>
    return (Object.keys(l) as K[]).filter((k) => errors[k]).map((k) => ({ field: k, label: l[k], message: errors[k]! }))
  }, [errors, labelKey])

  /** 오류를 통째로 바꾸고 첫 오류 칸으로 포커스(서버 field_errors도 이것으로) */
  const setErrors = useCallback(
    (next: Partial<Record<K, string | null | undefined | false>>) => {
      const clean: Partial<Record<K, string>> = {}
      const order = Object.keys(JSON.parse(labelKey)) as K[]
      for (const k of Object.keys(next) as K[]) {
        const v = next[k]
        if (typeof v === "string" && v) clean[k] = v
      }
      setErrorsState(clean)
      const first = order.find((k) => clean[k]) ?? (Object.keys(clean)[0] as K | undefined)
      if (first) requestAnimationFrame(() => focusField(first))
    },
    [labelKey],
  )

  /** 검사 결과 맵(값이 문자열이면 오류). 오류가 없으면 true */
  const check = useCallback(
    (rules: Partial<Record<K, string | null | undefined | false>>) => {
      const has = Object.values(rules).some((v) => typeof v === "string" && v)
      setErrors(rules)
      return !has
    },
    [setErrors],
  )

  const clear = useCallback((key?: K) => {
    setErrorsState((prev) => {
      if (!key) return {}
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const field = useCallback(
    (key: K) => ({
      id: fieldId(key),
      "aria-invalid": errors[key] ? (true as const) : undefined,
      "aria-describedby": errors[key] ? errorId(key) : undefined,
    }),
    [errors],
  )

  return { errors, summary, check, setErrors, clear, field, fieldId: (k: K) => fieldId(k), errorId: (k: K) => errorId(k), hasErrors: summary.length > 0 }
}

/** 폼 맨 위 오류 요약. 기본은 오류가 2개 이상일 때만 보인다(min). 칸 이름을 누르면 그 칸으로 간다 */
export function ErrorSummary({
  errors,
  min = 2,
  title,
  className,
}: {
  errors: FieldErrorItem[]
  min?: number
  title?: string
  className?: string
}) {
  if (errors.length < min || errors.length === 0) return null
  return (
    <div role="alert" tabIndex={-1} className={cn("rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-900", className)}>
      <p className="flex items-center gap-2 font-semibold">
        <CircleAlert className="size-4 shrink-0" aria-hidden />
        {title ?? `확인할 칸이 ${errors.length}개 있어요`}
      </p>
      <ul className="mt-1.5 list-disc space-y-1 pl-6 text-[15px]">
        {errors.map((e) => (
          <li key={e.field}>
            <a
              href={`#${fieldId(e.field)}`}
              onClick={(ev) => {
                ev.preventDefault()
                focusField(e.field)
              }}
              className="underline underline-offset-2"
            >
              {e.label}
            </a>
            : {e.message}
          </li>
        ))}
      </ul>
    </div>
  )
}
