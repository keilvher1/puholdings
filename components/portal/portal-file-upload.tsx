"use client"

// 포털(입주기업)용 파일 올리기 — /api/portal/upload 사용(계획서 4.5.7).
// 저장 경로는 서버가 세션 기준 submissions/{tenant_id}/로 강제한다.
//   - 크기 한도는 상수 하나(PORTAL_UPLOAD_MAX_BYTES, 4MB). 서버 함수 요청 본문 한도(약 4.5MB) 때문에 실제로 그보다 큰 파일은 실패한다(ISS-039).
//     올리기 전에 브라우저에서 크기를 보고, 넘으면 요청 없이 칸 아래에 안내한다. 운영 확인 뒤 값만 바꾼다.
//   - [✕]는 목록에서만 뺀다(서버 파일을 바로 지우지 않는다, ISS-028). 제출(저장)할 때 보낸 목록이 기준이다.
//   - 올리는 중에 다른 파일을 빼도 다 올라간 뒤 빠진 파일이 되살아나지 않게 최신 목록 기준으로 붙인다(ISS-220).
//
// 사용 예:
//   <PortalFileUpload id="f-files" value={files} onChange={setFiles} error={fe.errors.files} errorId={fe.errorId("files")}
//     onUploadingChange={setUploading} contactPhone="054-279-8710" />

import { useEffect, useRef, useState } from "react"
import { Download, FileText, Loader2, Paperclip, X } from "lucide-react"
import { FieldError } from "@/components/ui/field"
import { friendlyError } from "@/lib/messages"
import type { Attachment } from "@/lib/db"

/** 포털 업로드 파일당 한도(바이트). 운영 확인 뒤 값만 바꾼다 */
export const PORTAL_UPLOAD_MAX_BYTES = 4 * 1024 * 1024
export const PORTAL_UPLOAD_MAX_LABEL = "4MB"

const ACCEPT =
  ".pdf,.doc,.docx,.hwp,.hwpx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.jpg,.jpeg,.png,.gif,.webp"

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const size = bytes / Math.pow(1024, i)
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function PortalFileUpload({
  value,
  onChange,
  label = "제출 파일",
  id = "f-files",
  error,
  errorId,
  onUploadingChange,
  contactPhone,
  disabled = false,
}: {
  value: Attachment[]
  onChange: (files: Attachment[]) => void
  label?: string
  /** [파일 고르기] 버튼 id(오류 요약 링크가 이 칸으로 온다) */
  id?: string
  /** 부르는 쪽의 칸 오류(예: "파일을 1개 이상 올려 주세요") */
  error?: string | null
  errorId?: string
  onUploadingChange?: (uploading: boolean) => void
  /** 크기 초과 안내에 넣을 센터 전화 */
  contactPhone?: string
  disabled?: boolean
}) {
  const [uploading, setUploading] = useState(false)
  const [localError, setLocalError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])
  const errId = errorId ?? `${id}-error`
  const message = localError || error || ""

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (inputRef.current) inputRef.current.value = ""
    if (files.length === 0) return

    const tooBig = files.filter((f) => f.size > PORTAL_UPLOAD_MAX_BYTES)
    const ok = files.filter((f) => f.size <= PORTAL_UPLOAD_MAX_BYTES)
    const problems: string[] = []
    if (tooBig.length > 0) {
      const names = tooBig.map((f) => `‘${f.name}’`).join(", ")
      problems.push(
        `${names} 파일이 ${PORTAL_UPLOAD_MAX_LABEL}보다 커요. PDF를 줄이거나 나눠서 올려 주세요.${contactPhone ? ` 어려우면 센터(${contactPhone})로 보내 주세요.` : ""}`,
      )
    }
    setLocalError(problems.join(" "))
    if (ok.length === 0) return

    setUploading(true)
    onUploadingChange?.(true)
    const uploaded: Attachment[] = []
    for (const file of ok) {
      try {
        const formData = new FormData()
        formData.append("file", file)
        const res = await fetch("/api/portal/upload", { method: "POST", body: formData, credentials: "include" })
        const data = await res.json().catch(() => ({}))
        if (res.ok && data.success) {
          uploaded.push({
            name: file.name,
            pathname: data.pathname,
            size: file.size,
            type: file.type || "",
            ...(data.preview_status ? { preview_status: data.preview_status } : {}),
          })
        } else {
          problems.push(`‘${file.name}’: ${friendlyError(res.status, data.error, "파일을 올리지 못했어요.")}`)
        }
      } catch {
        problems.push(`‘${file.name}’: ${friendlyError(0, null, "파일을 올리지 못했어요.")}`)
      }
    }
    // 올리는 동안 사용자가 뺀 파일이 되살아나지 않게 최신 목록에 붙인다
    if (uploaded.length > 0) onChange([...valueRef.current, ...uploaded])
    setLocalError(problems.join(" "))
    setUploading(false)
    onUploadingChange?.(false)
  }

  const handleRemove = (pathname: string) => {
    onChange(valueRef.current.filter((f) => f.pathname !== pathname))
  }

  return (
    <div>
      <p className="mb-1.5 text-base font-medium text-dark">{label}</p>

      {value.length > 0 && (
        <ul className="mb-3 space-y-2" aria-label={`${label} 목록`}>
          {value.map((file) => (
            <li key={file.pathname} className="flex items-center justify-between gap-2 rounded-md border border-warm-tan bg-warm-ivory px-3 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="size-4 shrink-0 text-text-secondary" aria-hidden />
                <span className="truncate text-[15px] text-dark">{file.name}</span>
                <span className="shrink-0 text-sm text-text-secondary">({formatBytes(file.size)})</span>
              </div>
              <div className="flex shrink-0 items-center">
                <a
                  href={`/api/file?pathname=${encodeURIComponent(file.pathname)}&download=1&name=${encodeURIComponent(file.name)}`}
                  className="inline-flex size-11 items-center justify-center rounded-md text-[#3f3f4e] hover:bg-warm-beige hover:text-dark"
                  aria-label={`${file.name} 받기`}
                  title="받기"
                >
                  <Download className="size-4" aria-hidden />
                </a>
                <button
                  type="button"
                  onClick={() => handleRemove(file.pathname)}
                  disabled={disabled}
                  className="inline-flex size-11 items-center justify-center rounded-md text-[#3f3f4e] hover:bg-red-50 hover:text-red-800 disabled:opacity-50"
                  aria-label={`${file.name} 목록에서 빼기`}
                  title="목록에서 빼기"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        id={id}
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || disabled}
        aria-invalid={message ? true : undefined}
        aria-describedby={`${id}-hint${message ? ` ${errId}` : ""}`}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-md border border-dashed border-[#8a8a99] bg-card px-4 text-base font-medium text-dark hover:bg-warm-beige disabled:opacity-60 aria-[invalid=true]:border-red-700"
      >
        {uploading ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden /> 올리는 중…
          </>
        ) : (
          <>
            <Paperclip className="size-4" aria-hidden /> 파일 고르기
          </>
        )}
      </button>

      <input ref={inputRef} type="file" accept={ACCEPT} multiple onChange={handleSelect} className="hidden" tabIndex={-1} aria-hidden />

      <p id={`${id}-hint`} className="mt-1.5 text-sm text-text-secondary [word-break:keep-all]">
        PDF·한글·워드·엑셀·PPT·이미지·압축 파일 · 파일당 {PORTAL_UPLOAD_MAX_LABEL}까지
      </p>
      {message && (
        <FieldError id={errId} className="mt-1 text-[15px] text-red-800 [word-break:keep-all]">
          {message}
        </FieldError>
      )}
    </div>
  )
}
