"use client"

// 원본 미리보기 — URL + 형식으로 이미지(img) 또는 PDF(iframe)를 보여 준다(/api/file·bills/preview는 inline 응답).
// PdfPreviewSheet는 오른쪽 시트로 연다. 증빙 편집 시트(WP3)·월 마감 3·4단계(WP6)·청구서 상세(WP7)가 같이 쓴다.
// (업로드 검토 창의 로컬 파일 미리보기는 WP2 자체 구현 유지)
//
// 사용 예:
//   <FilePreview url={`/api/file?pathname=${encodeURIComponent(r.file_pathname)}`} type={r.file_type} name={r.file_name} />
//   <PdfPreviewSheet open={!!previewId} onOpenChange={(o) => !o && setPreviewId(null)}
//     url={`/api/admin/billing/bills/preview?id=${previewId}`} title="(주)솔바람테크 10월분 청구서 미리보기" />

import { useState } from "react"
import { ExternalLink, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

function kindOf(type: string | null | undefined, url: string, name?: string | null): "image" | "pdf" | "other" {
  const t = (type ?? "").toLowerCase()
  if (t.startsWith("image/")) return "image"
  if (t === "application/pdf") return "pdf"
  const probe = `${name ?? ""} ${url}`.toLowerCase()
  if (/\.(png|jpe?g|webp|gif|heic)(\b|$)/.test(probe)) return "image"
  if (/\.pdf(\b|$)/.test(probe) || /bills\/preview/.test(probe)) return "pdf"
  return "other"
}

export function FilePreview({
  url,
  type,
  name,
  className,
  height = "70vh",
}: {
  url: string
  /** MIME 형식(image/png, application/pdf). 없으면 파일 이름·주소로 짐작 */
  type?: string | null
  name?: string | null
  className?: string
  /** PDF 틀 높이(CSS 값) */
  height?: string
}) {
  const [failed, setFailed] = useState(false)
  const kind = kindOf(type, url, name)
  const title = name ? `${name} 미리보기` : "원본 미리보기"
  const openLink = (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[15px] text-link underline underline-offset-2">
      새 창에서 열기
      <ExternalLink className="size-4" aria-hidden />
    </a>
  )
  if (kind === "other" || failed) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 rounded-md border border-warm-tan bg-warm-ivory px-4 py-10 text-center", className)}>
        <p className="text-base text-dark">{failed ? "미리보기를 불러오지 못했어요" : "이 파일은 미리보기를 할 수 없어요"}</p>
        {openLink}
      </div>
    )
  }
  return (
    <figure className={cn("overflow-hidden rounded-md border border-warm-tan bg-warm-ivory", className)}>
      {kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={title} onError={() => setFailed(true)} className="mx-auto block max-h-[70vh] w-auto max-w-full object-contain" />
      ) : (
        <iframe src={url} title={title} className="block w-full bg-card" style={{ height }} />
      )}
      <figcaption className="flex items-center justify-between gap-2 border-t border-warm-tan bg-card px-3 py-2 text-sm text-[#3f3f4e]">
        <span className="truncate">{name ?? ""}</span>
        {openLink}
      </figcaption>
    </figure>
  )
}

export function PdfPreviewSheet({
  open,
  onOpenChange,
  url,
  title,
  type = "application/pdf",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  url: string | null
  title: string
  type?: string
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="app-shell w-full gap-0 bg-card p-0 sm:max-w-3xl [&>button:last-child]:hidden">
        <SheetHeader className="flex-row items-center gap-3 border-b border-warm-tan px-5 py-3">
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-lg font-semibold text-dark">{title}</SheetTitle>
            <SheetDescription className="sr-only">{title}</SheetDescription>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" className="text-[#3f3f4e] hover:bg-warm-beige hover:text-dark" onClick={() => onOpenChange(false)} aria-label={`${title} 닫기`}>
            <X aria-hidden />
          </Button>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{url && <FilePreview url={url} type={type} height="calc(100dvh - 9rem)" />}</div>
      </SheetContent>
    </Sheet>
  )
}
