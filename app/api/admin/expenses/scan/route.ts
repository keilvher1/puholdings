import { NextResponse } from "next/server"
import type { ScanResponse } from "@/lib/expenses"
import { fail, requireAdminDb } from "@/lib/expense-db"
import { scanUploadedReceipt } from "@/lib/expense-scan"
import type { SimilarReceipt } from "@/lib/expense-dedupe"

// POST /api/admin/expenses/scan  multipart: file(1개 — 사진 또는 PDF, 4MB 이하)
//   + original_hash(선택): 브라우저가 줄이기 전 원본 파일의 sha256 hex. 같은 사진을 다른 기기·브라우저에서 올려
//     전송본이 달라져도 같은 파일로 알아보기 위해 file.hash(저장 시 file_hash)로 쓴다. 없으면 전송본 해시.
// 원본을 Blob(private, expenses/receipts/YYYY-MM/...)에 보관하고, 같은 파일로 이미 저장된 증빙(duplicates)을 찾고,
// 활성 프로젝트 목록을 참고해 AI OCR 초안(drafts)을 돌려준다. DB에는 아무것도 저장하지 않는다.
//
// 성공: ScanResponse { success:true, file, drafts, duplicates }
//   + warnings(파일 전체 경고, 각 초안 warnings에도 합쳐 둠)
//   + possible_duplicates: SimilarReceipt[][] (drafts와 같은 순서) — 파일은 다르지만 같은 거래로 보이는 저장된 증빙
//     (승인번호 일치, 또는 거래처·합계가 같고 날짜가 7일 이내). 화면은 이런 행의 기본 선택을 해제한다.
//   AI가 증빙을 못 찾으면 빈 초안 1개(직접 입력용)를 돌려준다 — 파일이 표에서 사라지지 않도록.
// 실패: { success:false, error, needs_setup? } — 원본 보관 이후의 실패(AI 미설정·AI 오류)에는
//   file·duplicates를 함께 돌려주므로 화면은 빈 행을 만들어 직접 입력을 이어갈 수 있다.

// 검사·보관·인식 단계는 lib/expense-scan.ts(데스크톱 앱용 /inbox와 공용).

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// 비전 추론(여러 페이지 PDF 포함)이라 기본 타임아웃으로는 모자랄 수 있다.
export const maxDuration = 300

export async function POST(request: Request) {
  const auth = await requireAdminDb()
  if (auth.response) return auth.response
  const sql = auth.sql

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return fail("파일을 받지 못했습니다. 4MB 이하 파일로 다시 시도하세요.", 400)
  }

  const out = await scanUploadedReceipt(sql, formData)
  switch (out.stage) {
    case "rejected":
      return fail(out.error, out.status)
    case "not_configured":
      return fail(out.message, 503, { needs_setup: true, file: out.file, duplicates: out.duplicates })
    case "scan_failed":
      return fail(out.message, out.status, {
        ...(out.needsSetup ? { needs_setup: true } : {}),
        file: out.file,
        duplicates: out.duplicates,
      })
    case "ok": {
      const body: ScanResponse & { warnings: string[]; possible_duplicates: SimilarReceipt[][] } = {
        success: true,
        file: out.file,
        drafts: out.drafts,
        duplicates: out.duplicates,
        warnings: out.warnings,
        possible_duplicates: out.possible_duplicates,
      }
      return NextResponse.json(body)
    }
  }
}
