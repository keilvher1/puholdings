'use client'

import * as React from 'react'

// 대화상자·시트를 닫으면 연 버튼으로 초점을 돌려준다(WCAG 2.4.3 초점 순서).
// Radix는 Trigger로 열었을 때만 Trigger로 돌려주고, 상태(open prop·URL 파라미터·useConfirm)로 열면 초점이 body로 간다.
// 열릴 때(onOpenAutoFocus — 초점이 아직 연 요소에 있다) 그 요소를 기억했다가, 닫힐 때(onCloseAutoFocus) 아직 화면에 있으면 돌려준다.
// 호출하는 쪽이 넘긴 핸들러를 먼저 부르고, 그쪽이 preventDefault 했으면 건드리지 않는다.
// 연 요소가 이미 사라졌으면(행이 다시 그려짐 등) Radix 기본 동작(Trigger가 있으면 Trigger)으로 둔다.
export function useReturnFocus(
  onOpenAutoFocus?: (event: Event) => void,
  onCloseAutoFocus?: (event: Event) => void,
) {
  const openerRef = React.useRef<HTMLElement | null>(null)

  const handleOpen = React.useCallback(
    (event: Event) => {
      const active = typeof document !== 'undefined' ? document.activeElement : null
      openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null
      onOpenAutoFocus?.(event)
    },
    [onOpenAutoFocus],
  )

  const handleClose = React.useCallback(
    (event: Event) => {
      onCloseAutoFocus?.(event)
      const opener = openerRef.current
      openerRef.current = null
      if (event.defaultPrevented) return
      // 닫는 동안 코드가 이미 다른 곳으로 초점을 옮겼으면(예: 검토 창을 닫고 [저장] 버튼으로) 그대로 둔다
      const active = document.activeElement
      const container = (event.currentTarget ?? event.target) as Node | null
      if (active && active !== document.body && !(container && container.contains(active))) return
      if (opener && opener.isConnected) {
        event.preventDefault()
        opener.focus({ preventScroll: true })
      }
    },
    [onCloseAutoFocus],
  )

  return { onOpenAutoFocus: handleOpen, onCloseAutoFocus: handleClose }
}
