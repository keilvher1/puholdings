import { type NextRequest, NextResponse } from "next/server"
import sharp from "sharp"
import { getSession } from "@/lib/auth"
import { isValidPeriod } from "@/lib/billing"
import { storeUpload } from "@/lib/upload"
import { hasApiKey, scanMeterImages, type ScanImage } from "@/lib/meter-scan"

// POST /api/admin/billing/meters/scan
// 계량기·한전 고지서 사진을 OpenAI vision으로 판독해 "제안값"을 돌려준다.
// 이 라우트는 아무것도 저장하지 않는다 — 관리자가 화면에서 확인·수정한 뒤 기존
// PUT /api/admin/billing/meters 로 저장한다. 원본 사진만 감사 근거로 Blob에 남긴다.

// 이미지 여러 장 + 비전 추론이라 기본 타임아웃으로는 모자랄 수 있다.
export const maxDuration = 300

const MAX_IMAGES = 8
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])

export async function POST(request: NextRequest) {
  if (!(await getSession())) {
    return NextResponse.json({ success: false, error: "인증이 필요합니다" }, { status: 401 })
  }
  if (!hasApiKey()) {
    return NextResponse.json(
      {
        success: false,
        error:
          "사진 판독 기능이 아직 설정되지 않았습니다. 관리자에게 OPENAI_API_KEY 환경변수 설정을 요청하세요.",
        needs_setup: true,
      },
      { status: 503 }
    )
  }

  try {
    const formData = await request.formData()
    const files = formData.getAll("files").filter((f): f is File => f instanceof File)
    const hint = String(formData.get("hint") ?? "")
    const period = String(formData.get("period") ?? "")

    if (files.length === 0) {
      return NextResponse.json({ success: false, error: "사진을 한 장 이상 올려주세요" }, { status: 400 })
    }
    if (files.length > MAX_IMAGES) {
      return NextResponse.json(
        { success: false, error: `사진은 한 번에 ${MAX_IMAGES}장까지 판독할 수 있습니다` },
        { status: 400 }
      )
    }
    for (const f of files) {
      if (!IMAGE_TYPES.has(f.type)) {
        return NextResponse.json(
          { success: false, error: `${f.name}은(는) 이미지 파일이 아닙니다 (JPG·PNG·WebP만 가능)` },
          { status: 400 }
        )
      }
    }

    // 원본은 감사 근거로 Blob에 보관하고, 판독에는 긴 변을 1568px로 줄인 JPEG를 쓴다.
    // (Anthropic 권장 상한 — 이보다 크게 보내도 정확도는 오르지 않고 비용·지연만 늘어난다.)
    const folder = `billing/meter-scans/${isValidPeriod(period) ? period : "unknown"}`
    const prepared = await Promise.all(
      files.map(async (file) => {
        const buffer = Buffer.from(await file.arrayBuffer())
        const [resized, stored] = await Promise.all([
          sharp(buffer).rotate().resize(1568, 1568, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer(),
          // 보관 실패가 판독을 막지 않도록 개별적으로 흡수한다.
          storeUpload(file, folder).catch(() => ({ ok: false as const, error: "보관 실패" })),
        ])
        return {
          name: file.name,
          image: { media_type: "image/jpeg", data: resized.toString("base64") } satisfies ScanImage,
          pathname: stored.ok ? stored.pathname : null,
        }
      })
    )

    const result = await scanMeterImages(prepared.map((p) => p.image), hint)

    return NextResponse.json({
      success: true,
      result,
      images: prepared.map((p, i) => ({ index: i, name: p.name, pathname: p.pathname })),
    })
  } catch (error) {
    console.error("Meter scan error:", error)
    const message = error instanceof Error ? error.message : "판독에 실패했습니다"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
