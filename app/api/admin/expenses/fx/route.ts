import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isValidDate, type FxRateResponse } from "@/lib/expenses"
import { getExchangeRate, isForeignCurrency } from "@/lib/fx"

// GET /api/admin/expenses/fx?currency=USD&date=YYYY-MM-DD → FxRateResponse
// date(결제일) 기준 환율(1 외화 단위당 원). 주말·휴일이면 직전 영업일 고시, 오늘·미래 날짜면 오늘의 최신 고시.
// 출처: 한국수출입은행 매매기준율(env KOREAEXIM_API_KEY) → 실패·미설정 시 유럽중앙은행(Frankfurter).
// 조회만 한다. 증빙에 저장하는 것은 화면에서 사람이 확인한 뒤다.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function bad(error: string, status: number) {
  const body: FxRateResponse = { success: false, error }
  return NextResponse.json(body, { status })
}

export async function GET(request: Request) {
  if (!(await getSession())) return bad("인증이 필요합니다", 401)
  const params = new URL(request.url).searchParams
  const currency = (params.get("currency") ?? "").trim().toUpperCase()
  const date = (params.get("date") ?? "").trim()
  if (!isForeignCurrency(currency)) return bad("환율을 조회할 외화 통화를 고르세요(USD·EUR·JPY·CNY·GBP)", 400)
  if (!isValidDate(date)) return bad("결제일(거래일자)을 YYYY-MM-DD 형식으로 입력하세요", 400)

  const fx = await getExchangeRate(currency, date)
  if (!fx) return bad("환율을 가져오지 못했습니다. 잠시 후 다시 시도하거나 환율을 직접 입력하세요.", 502)
  const body: FxRateResponse = { success: true, currency, requested_date: date, rate_date: fx.rate_date, rate: fx.rate, source: fx.source }
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } })
}
