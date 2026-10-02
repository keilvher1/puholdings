"use client"

// [복사] 버튼 — navigator.clipboard로 복사하고 성공하면 토스트 "복사했어요".
// 실패하면(인앱 브라우저 등) 값을 선택 상태로 보여 주고 옆에 "길게 눌러 복사해 주세요"를 띄운다.
//
// 사용 예:
//   <CopyButton value={bank.account} label="계좌번호 복사" />              // 계좌번호만(숫자·하이픈)
//   <CopyButton value={noticeText} label="안내 문구 복사" variant="outline" successMessage="안내 문구를 복사했어요" />
//   <CopyButton value={bank.account} label="계좌번호 복사" fullWidth />            // 늘 가로 100%
//   <CopyButton value={bank.account} label="계좌번호 복사" fullWidth="mobile" />   // 휴대폰(640px 미만)만 가로 100%, 그 이상은 내용 폭

import { useRef, useState } from "react"
import { Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toastSuccess } from "./toast"

export function CopyButton({
  value,
  label = "복사",
  successMessage = "복사했어요",
  variant = "outline",
  size = "sm",
  fullWidth = false,
  className,
}: {
  value: string
  label?: string
  successMessage?: string
  variant?: "outline" | "default" | "ghost"
  size?: "sm" | "default" | "lg"
  /** 가로 100%. "mobile"이면 640px 미만에서만 */
  fullWidth?: boolean | "mobile"
  className?: string
}) {
  const [fallback, setFallback] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable")
      await navigator.clipboard.writeText(value)
      setFallback(false)
      toastSuccess(successMessage)
    } catch {
      setFallback(true)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }

  return (
    <span
      className={cn(
        fullWidth === true
          ? "flex w-full flex-col items-stretch gap-2"
          : fullWidth === "mobile"
            ? "flex w-full flex-col items-stretch gap-2 sm:inline-flex sm:w-auto sm:flex-row sm:flex-wrap sm:items-center"
            : "inline-flex flex-wrap items-center gap-2",
        className,
      )}
    >
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={copy}
        className={cn(variant === "outline" && "hover:bg-warm-beige hover:text-dark", fullWidth === true && "w-full", fullWidth === "mobile" && "w-full sm:w-auto")}
      >
        <Copy aria-hidden />
        {label}
      </Button>
      {fallback && (
        <span className={cn("inline-flex items-center gap-2", fullWidth && "flex-wrap")}>
          <input
            ref={inputRef}
            readOnly
            value={value}
            aria-label={`${label} 값`}
            onFocus={(e) => e.currentTarget.select()}
            className="h-8 w-44 rounded-md border border-warm-tan bg-card px-2 text-[15px] tabular-nums text-dark"
          />
          <span role="status" className="text-sm text-[#3f3f4e]">
            길게 눌러 복사해 주세요
          </span>
        </span>
      )}
    </span>
  )
}
