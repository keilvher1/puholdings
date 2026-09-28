"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Camera, FileUp, ImagePlus, UploadCloud } from "lucide-react"
import { SCAN_ACCEPT } from "@/lib/expenses"
import { cn } from "@/lib/utils"

// 증빙 파일을 받는 곳: 끌어다 놓기(화면 어디든) · 클릭해서 고르기 · Ctrl+V 붙여넣기 · 휴대폰 카메라.
// 파일을 받으면 곧바로 onFiles로 넘긴다(검증·대기열은 부모가 처리).

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files")
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

// 클립보드 이미지는 이름이 모두 "image.png"라 구분이 안 되므로 시각을 붙여 준다.
function renamePasted(files: File[]): File[] {
  const d = new Date()
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return files.map((f, i) => {
    if (!/^image\.(png|jpe?g|gif|webp)$/i.test(f.name) && f.name) return f
    const ext = (f.type.split("/")[1] || "png").replace("jpeg", "jpg")
    return new File([f], `붙여넣은-이미지-${stamp}${files.length > 1 ? `-${i + 1}` : ""}.${ext}`, {
      type: f.type,
      lastModified: f.lastModified,
    })
  })
}

export function UploadDropzone({
  onFiles,
  compact = false,
  disabled = false,
}: {
  onFiles: (files: File[]) => void
  compact?: boolean
  disabled?: boolean
}) {
  const pickRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [over, setOver] = useState(false)
  const onFilesRef = useRef(onFiles)
  useEffect(() => {
    onFilesRef.current = onFiles
  }, [onFiles])

  // 화면 어디에 놓아도 받는다(드롭존을 정확히 겨누지 않아도 되도록) + 브라우저가 파일을 열어 버리는 것을 막는다.
  useEffect(() => {
    if (disabled) return
    let depth = 0
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"
    }
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      setOver(false)
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length > 0) onFilesRef.current(files)
    }
    window.addEventListener("dragenter", onEnter)
    window.addEventListener("dragover", onOver)
    window.addEventListener("dragleave", onLeave)
    window.addEventListener("drop", onDrop)
    return () => {
      window.removeEventListener("dragenter", onEnter)
      window.removeEventListener("dragover", onOver)
      window.removeEventListener("dragleave", onLeave)
      window.removeEventListener("drop", onDrop)
    }
  }, [disabled])

  // Ctrl+V(⌘+V)로 캡처 화면·복사한 이미지를 바로 올린다. 글자만 붙여넣을 때는 건드리지 않는다.
  useEffect(() => {
    if (disabled) return
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length === 0) return
      e.preventDefault()
      onFilesRef.current(renamePasted(files))
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [disabled])

  const openPicker = () => pickRef.current?.click()

  const inputs = (
    <>
      <input
        ref={pickRef}
        type="file"
        accept={SCAN_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ""
          if (files.length) onFiles(files)
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ""
          if (files.length) onFiles(files)
        }}
      />
    </>
  )

  const overlay = dragging && (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-dark/40 backdrop-blur-[2px]">
      <div className="rounded-2xl border-2 border-dashed border-gold bg-card px-10 py-8 text-center shadow-xl">
        <UploadCloud className="mx-auto h-10 w-10 text-gold" />
        <p className="mt-3 text-base font-semibold text-dark">여기에 놓으면 바로 분석을 시작합니다</p>
        <p className="mt-1 text-sm text-text-secondary">여러 파일을 한꺼번에 놓아도 됩니다</p>
      </div>
    </div>
  )

  if (compact) {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-warm-tan bg-card px-4 py-3",
          over && "border-gold bg-gold/5"
        )}
        onDragEnter={() => setOver(true)}
        onDragLeave={() => setOver(false)}
      >
        {inputs}
        {overlay}
        <UploadCloud className="h-5 w-5 shrink-0 text-gold" />
        <p className="mr-auto text-sm text-text-secondary [word-break:keep-all]">
          더 올릴 증빙이 있으면 끌어다 놓거나 <span className="hidden md:inline">Ctrl+V로 붙여넣거나 </span>아래 버튼을 누르세요.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={openPicker} disabled={disabled}>
          <FileUp className="h-4 w-4" />
          파일 추가
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => cameraRef.current?.click()} disabled={disabled} className="md:hidden">
          <Camera className="h-4 w-4" />
          촬영
        </Button>
      </div>
    )
  }

  return (
    <div>
      {inputs}
      {overlay}
      <div
        role="button"
        tabIndex={0}
        aria-label="증빙 파일 올리기: 클릭해서 파일 선택"
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && openPicker()}
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            openPicker()
          }
        }}
        onDragEnter={() => setOver(true)}
        onDragLeave={() => setOver(false)}
        className={cn(
          "group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-warm-tan bg-card px-6 py-12 text-center transition-colors outline-none",
          "hover:border-gold/70 hover:bg-gold/5 focus-visible:border-gold focus-visible:ring-[3px] focus-visible:ring-gold/40",
          over && "border-gold bg-gold/5",
          disabled && "pointer-events-none opacity-60"
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 transition-transform group-hover:scale-105">
          <UploadCloud className="h-7 w-7 text-gold" />
        </div>
        <p className="mt-4 text-lg font-semibold text-dark [word-break:keep-all]">
          영수증·카드전표·세금계산서를 여기에 끌어다 놓으세요
        </p>
        <p className="mt-1.5 text-sm text-text-secondary [word-break:keep-all]">
          클릭해서 파일을 고르거나<span className="hidden md:inline">, 캡처한 이미지를 Ctrl+V로 붙여넣어도 됩니다</span>. 여러 개를 한꺼번에 올려도 됩니다.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              openPicker()
            }}
            disabled={disabled}
          >
            <ImagePlus className="h-4 w-4" />
            파일 선택
          </Button>
          <Button
            type="button"
            variant="outline"
            className="md:hidden"
            onClick={(e) => {
              e.stopPropagation()
              cameraRef.current?.click()
            }}
            disabled={disabled}
          >
            <Camera className="h-4 w-4" />
            카메라로 촬영
          </Button>
        </div>
        <p className="mt-4 text-xs text-text-tertiary [word-break:keep-all]">
          사진(JPG·PNG·HEIC 등) 또는 PDF · PDF는 한 파일 4MB까지 · 사진은 자동으로 줄여서 보냅니다
        </p>
      </div>
    </div>
  )
}
