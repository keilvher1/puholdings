// 금액 표시 — 천 단위 쉼표 · tabular-nums · 줄바꿈 없음. null이면 "-". 오른쪽 정렬은 부모(표 셀)가 정한다.
// 서버·클라이언트 공용(훅 없음). 문장 속 금액은 lib/format의 won()을 써도 된다.
//
// 사용 예:
//   <Money value={1234000} />                 // 1,234,000원
//   <TableCell className="text-right"><Money value={row.total} unit="none" /></TableCell>   // 머리글에 "(원)"
//   <Money value={-5000} tone="danger" strong />

import { cn } from "@/lib/utils"
import { wonNum, toNumber, type NumberLike } from "@/lib/format"

export function Money({
  value,
  unit = "원",
  tone = "default",
  strong = false,
  className,
}: {
  value: NumberLike
  /** "원"(기본)이면 숫자 뒤에 원, "none"이면 숫자만 */
  unit?: "원" | "none"
  tone?: "default" | "muted" | "danger" | "success"
  strong?: boolean
  className?: string
}) {
  const v = toNumber(value)
  const text = wonNum(v)
  return (
    <span
      className={cn(
        "whitespace-nowrap tabular-nums",
        tone === "default" && "text-dark",
        tone === "muted" && "text-text-secondary",
        tone === "danger" && "text-red-800",
        tone === "success" && "text-green-800",
        strong && "font-semibold",
        className,
      )}
    >
      {text}
      {unit === "원" && v !== null && "원"}
    </span>
  )
}
