// 값의 출처 표시 — 칸 라벨 옆 작은 회색 글자: "자동 인식"(사진·파일 판독이 채운 값), "직접 입력"(사람이 고친 값), "지난달 값"(불러온 값).
// 반짝이 아이콘·보라색·감탄문을 쓰지 않는다. 판독값은 제안일 뿐이며 저장은 사람이 누른다(CLAUDE.md 9항). 서버·클라이언트 공용.
//
// 사용 예:
//   <Label>금액 <SourceTag source={edited ? "manual" : "auto"} /></Label>
//   <SourceTag source="previous" />

import { cn } from "@/lib/utils"

export type ValueSource = "auto" | "manual" | "previous"

const SOURCE_LABEL: Record<ValueSource, string> = {
  auto: "자동 인식",
  manual: "직접 입력",
  previous: "지난달 값",
}

export function SourceTag({ source, className }: { source: ValueSource | null | undefined; className?: string }) {
  if (!source) return null
  return (
    <span className={cn("ml-1.5 inline-block whitespace-nowrap align-baseline text-xs font-normal text-text-secondary", className)}>
      {SOURCE_LABEL[source]}
    </span>
  )
}
