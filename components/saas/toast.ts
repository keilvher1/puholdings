// 성공 확인 토스트 — 끝난 일의 짧은 확인에만 쓴다(계획서 1장 상충 규칙·2.1). 오류용 함수는 만들지 않는다
// (오류는 화면 안 Notice·칸 오류). 결과가 화면에 바로 보이면(표에 행이 생김, 배지가 바뀜) 토스트도 생략한다.
// 위치·시간은 AppProviders의 Toaster가 정한다(하단 중앙, 4초, 되돌리기가 있으면 8초, 마우스를 올리면 멈춤).
//
// 사용 예(클라이언트 컴포넌트):
//   toastSuccess("(주)솔바람테크 8월분 청구서를 납부 완료로 바꿨어요")
//   toastSuccess("해결로 표시했어요", { undo: async () => { await reopen(id); router.refresh() } })
//   toastInfo("목록을 새로 불러왔어요")

import { toast } from "sonner"

let toasterMounted = false

/** AppProviders가 Toaster를 붙이고 뗄 때 부른다(Provider 밖 호출을 개발 중에 알리려는 용도) */
export function markToasterMounted(mounted: boolean): void {
  toasterMounted = mounted
}

function warnIfNoToaster(message: string) {
  if (!toasterMounted && typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    console.error(`[toast] AppProviders(Toaster) 밖에서 불렸어요. 레이아웃에 AppProviders가 있는지 확인하세요: "${message}"`)
  }
}

const CLOSE = { label: "닫기", onClick: () => {} }

export interface ToastSuccessOptions {
  /** 한 줄 보조 설명 */
  description?: string
  /** 되돌리기. 있으면 토스트가 8초 보인다 */
  undo?: () => void | Promise<void>
  /** 기본 "되돌리기" */
  undoLabel?: string
}

/** 성공 토스트("~했어요" 한 문장). 반환값은 토스트 id */
export function toastSuccess(message: string, options: ToastSuccessOptions = {}): string | number {
  warnIfNoToaster(message)
  const { description, undo, undoLabel = "되돌리기" } = options
  return toast.success(message, {
    description,
    duration: undo ? 8000 : 4000,
    action: undo
      ? {
          label: undoLabel,
          onClick: () => {
            void undo()
          },
        }
      : undefined,
    cancel: CLOSE,
  })
}

/** 중립 안내 토스트(성공도 오류도 아닌 짧은 확인). 문제·경고는 Notice로 */
export function toastInfo(message: string, options: { description?: string } = {}): string | number {
  warnIfNoToaster(message)
  return toast(message, { description: options.description, duration: 4000, cancel: CLOSE })
}
