// 처리 중 잠금 버튼 — busy면 Spinner + busyLabel("저장 중…")로 바뀌고 잠긴다(두 번 클릭 방지, 가드 #7).
// 필수값이 비어도 버튼은 켜 둔다(누르면 오류 요약으로 알린다). 잠금은 처리 중에만. 서버·클라이언트 공용.
//
// 사용 예:
//   <BusyButton busy={saving} onClick={save}>저장하기</BusyButton>
//   <BusyButton busy={issuing} busyLabel="발행 중…" variant="default">22건 발행하기</BusyButton>

import type { ComponentProps, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

export function BusyButton({
  busy = false,
  busyLabel = "저장 중…",
  disabled,
  children,
  ...rest
}: ComponentProps<typeof Button> & { busy?: boolean; busyLabel?: ReactNode }) {
  return (
    <Button {...rest} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {busyLabel}
        </>
      ) : (
        children
      )}
    </Button>
  )
}
