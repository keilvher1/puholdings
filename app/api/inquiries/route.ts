import { NextResponse, after } from "next/server"
import { getDb } from "@/lib/db"
import { sendMail } from "@/lib/mail"
import { notifyInquiry } from "@/lib/messenger-notify"

// 공개 엔드포인트 스팸 방어.
// - honeypot: 폼의 숨김 필드(website)가 채워져 있으면 봇으로 간주하고 조용히 무시
// - rate limit: IP당 10분에 5회 (인메모리 — 서버리스 인스턴스별이라 완전하지 않지만
//   단순 스크립트 남용은 걸러낸다)
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX = 5
const rateMap = new Map<string, number[]>()

// inquiries 컬럼 길이(운영 DB·scripts/001-create-tables.sql 기준). 넘으면 DB 오류(500) 대신 400으로 안내한다.
const MAX_LEN = { name: 255, company: 255, email: 255, phone: 50, message: 5000 } as const

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

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

    // honeypot — 봇에게는 성공한 것처럼 응답
    if (body?.website) {
      return NextResponse.json({ success: true })
    }

    const name = str(body?.name)
    const email = str(body?.email)
    const phone = str(body?.phone)
    const company = str(body?.company)
    const message = str(body?.message)

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "필수 항목을 입력해 주세요." },
        { status: 400 }
      )
    }
    if (
      name.length > MAX_LEN.name ||
      email.length > MAX_LEN.email ||
      phone.length > MAX_LEN.phone ||
      company.length > MAX_LEN.company ||
      message.length > MAX_LEN.message
    ) {
      return NextResponse.json(
        { error: "입력 내용이 너무 깁니다. 줄여서 다시 보내 주세요." },
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
    // 운영 inquiries 스키마: company_name·contact_person·email NOT NULL, status 기본값 'new'.
    // 회사명은 선택 입력이라 비어 있으면 빈 문자열로 저장한다(관리자 화면에서는 표시하지 않음).
    const rows = await sql`
      INSERT INTO inquiries (company_name, contact_person, email, phone, message)
      VALUES (${company}, ${name}, ${email}, ${phone || null}, ${message})
      RETURNING id
    `

    // 메신저 시스템 알림 토픽에도 남긴다(응답 후 실행, 실패해도 접수는 성공)
    notifyInquiry({ name, company, message })

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
  } catch (error) {
    // 접수 실패가 조용히 묻히지 않도록 런타임 로그에 남긴다.
    console.error("[inquiries] 문의 접수 실패:", error)
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    )
  }
}
