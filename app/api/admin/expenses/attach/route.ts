import { NextResponse } from "next/server"
import { MAX_SCAN_FILE_BYTES, SCAN_MIME_TYPES, type UploadedFileMeta } from "@/lib/expenses"
import { RECEIPT_PREFIX, checkUpload, fail, kstToday, nameWithKindExt, requireAdminDb, sha256Hex, storePrivateBlob } from "@/lib/expense-db"
import { parseHashField } from "@/lib/expense-scan"

// POST /api/admin/expenses/attach  multipart: file(1개 — 사진 또는 PDF, 4MB 이하) + original_hash(선택)
// 인건비 수기 등록에 붙이는 이체확인증·급여명세서 등 원본을 보관만 한다(자동 인식·DB 저장 없음).
// 파일 검사(크기·매직 바이트)는 /scan과 같다. 보관 위치: expenses/receipts/YYYY-MM/...
// → { success:true, file: UploadedFileMeta } — 이 file을 증빙 저장(POST/PUT /receipts)에 그대로 넘긴다.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const auth = await requireAdminDb()
  if (auth.response) return auth.response

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return fail("파일을 받지 못했습니다. 4MB 이하 파일로 다시 시도하세요.", 400)
  }
  const files = formData.getAll("file").filter((f): f is File => f instanceof File)
  if (files.length === 0) return fail("첨부할 파일(사진 또는 PDF)을 올리세요", 400)
  if (files.length > 1) return fail("한 번에 파일 1개씩 보내세요", 400)
  const file = files[0]

  const checked = await checkUpload(file, SCAN_MIME_TYPES, MAX_SCAN_FILE_BYTES)
  if (!checked.ok) return fail(checked.error, 400)
  if (checked.kind === "text") return fail("텍스트 파일은 첨부할 수 없습니다. 사진이나 PDF로 올리세요.", 400)

  const sentHash = sha256Hex(checked.buffer)
  const hash = parseHashField(formData.get("original_hash")) ?? sentHash
  const displayName = nameWithKindExt(file.name || "첨부", checked.kind)
  try {
    const pathname = await storePrivateBlob(`${RECEIPT_PREFIX}${kstToday().slice(0, 7)}`, displayName, checked.buffer, checked.mime)
    const meta: UploadedFileMeta = { pathname, name: displayName, type: checked.mime, size: checked.buffer.length, hash }
    return NextResponse.json({ success: true, file: meta })
  } catch (error) {
    console.error("Expense attach store error:", error)
    return fail("파일을 보관하지 못했습니다. 잠시 후 다시 시도하세요.", 500)
  }
}
