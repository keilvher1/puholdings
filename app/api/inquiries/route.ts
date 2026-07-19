import { NextResponse, after } from "next/server"
import { getDb } from "@/lib/db"
import { sendMail } from "@/lib/mail"

// 공개 엔드포인트 스팸 방어.
// - honeypot: 폼의 숨김 필드(website)가 채워져 있으면 봇으로 간주하고 조용히 무시
// - rate limit: IP당 10분에 5회 (인메모리 — 서버리스 인스턴스별이라 완전하지 않지만
//   단순 스크립트 남용은 걸러낸다)
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX = 5
const rateMap = new Map<string, number[]>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  // 맵이 커지면 오래된 키 정리
  if (rateMap.size > 500) {
    for (const [key, hits] of rateMap) {
      if (hits.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) rateMap.delete(key)
    }
  }
  const hits = (rateMap.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (hits.length >= RATE_LIMIT_MAX) {
    rateMap.set(ip, hits)
    return true
  }
  hits.push(now)
  rateMap.set(ip, hits)
  return false
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, email, phone, company, message, website } = body

    // honeypot — 봇에게는 성공한 것처럼 응답
    if (website) {
      return NextResponse.json({ success: true })
    }

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "필수 항목을 입력해 주세요." },
        { status: 400 }
      )
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429 }
      )
    }

    const sql = getDb()
    if (!sql) {
      return NextResponse.json(
        { error: "데이터베이스 연결에 실패했습니다." },
        { status: 500 }
      )
    }
    const rows = await sql`
      INSERT INTO inquiries (name, email, phone, company, message)
      VALUES (${name}, ${email}, ${phone || null}, ${company || null}, ${message})
      RETURNING id
    `

    // 관리자 알림 메일 — 응답을 지연시키지 않도록 응답 후 발송 (실패해도 접수는 성공)
    const notifyEmail = process.env.ADMIN_NOTIFY_EMAIL
    if (notifyEmail) {
      const inquiryId = rows[0]?.id
      after(async () => {
        await sendMail({
          to: notifyEmail,
          templateCode: "inquiry_received",
          related: { type: "inquiry", id: inquiryId },
          vars: {
            name,
            email,
            phone: phone || "-",
            company: company || "-",
            message,
            received_at: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
          },
        })
      })
    } else {
      console.warn("[mail] ADMIN_NOTIFY_EMAIL 미설정으로 문의 알림 메일을 건너뜁니다")
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    )
  }
}
