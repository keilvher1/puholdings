import { join } from "node:path"
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  renderToBuffer,
} from "@react-pdf/renderer"
import { formatWon, prevPeriod } from "./billing"

// 한글 폰트 임베드 (서버리스 번들에 포함됨 — next.config outputFileTracingIncludes)
let fontsRegistered = false
function ensureFonts() {
  if (fontsRegistered) return
  const dir = join(process.cwd(), "public", "fonts")
  Font.register({
    family: "Pretendard",
    fonts: [
      { src: join(dir, "Pretendard-Regular.ttf"), fontWeight: "normal" },
      { src: join(dir, "Pretendard-Bold.ttf"), fontWeight: "bold" },
    ],
  })
  fontsRegistered = true
}

export interface InvoiceElecLine {
  room_code: string
  amount: number
  metered: boolean
}

export interface FactoryDetail {
  mainUsage: number
  f101: { usage: number; hvacHalf: number; amount: number }
  f103: { usage: number; hvacHalf: number; amount: number }
  f102: { amount: number; deduction: number }
  unitPrice: number
}

export interface InvoicePdfInput {
  tenantName: string
  billMonth: string // YYYY-MM (청구월)
  rentMgmt: number // 임대료+관리비 (부가세 포함)
  elecAmount: number
  total: number
  per10Billed: number
  roomCodes: string[]
  elecLines: InvoiceElecLine[]
  bankInfo: string
  issueDate: string // YYYY-MM-DD
  factory?: FactoryDetail // metered 기업 2페이지
}

const monthNum = (p: string) => Number(p.slice(5, 7))

const s = StyleSheet.create({
  page: { fontFamily: "Pretendard", fontSize: 10, padding: 40, color: "#1a1a2e" },
  title: { fontSize: 18, fontWeight: "bold", textAlign: "center", marginBottom: 6 },
  subtitle: { fontSize: 10, textAlign: "center", color: "#666", marginBottom: 20 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  metaLabel: { color: "#666" },
  metaValue: { fontWeight: "bold" },
  table: { marginTop: 16, borderWidth: 1, borderColor: "#c9a227" },
  thead: { flexDirection: "row", backgroundColor: "#f5efe0", borderBottomWidth: 1, borderBottomColor: "#c9a227" },
  th: { padding: 8, fontWeight: "bold", textAlign: "center", borderRightWidth: 1, borderRightColor: "#e8e2d6" },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e8e2d6" },
  td: { padding: 8, borderRightWidth: 1, borderRightColor: "#e8e2d6" },
  tdR: { padding: 8, textAlign: "right", borderRightWidth: 1, borderRightColor: "#e8e2d6" },
  totalRow: { flexDirection: "row", backgroundColor: "#faf8f3" },
  note: { marginTop: 14, fontSize: 9, color: "#555" },
  per10: { marginTop: 12, fontSize: 11, fontWeight: "bold" },
  bank: { marginTop: 24, padding: 12, borderWidth: 1, borderColor: "#e8e2d6", fontSize: 10 },
  signature: { marginTop: 30, textAlign: "right", fontSize: 12, fontWeight: "bold" },
  h2: { fontSize: 13, fontWeight: "bold", marginBottom: 10 },
})

function InvoiceDocument({ data }: { data: InvoicePdfInput }) {
  const m = monthNum(data.billMonth)
  const em = monthNum(prevPeriod(data.billMonth))
  const rooms = data.roomCodes.join(", ")

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>창업보육센터 입주기업 사용료 청구</Text>
        <Text style={s.subtitle}>제1회 · 한동대학교 창업보육센터 · {data.issueDate}</Text>

        <View style={s.metaRow}>
          <Text style={s.metaLabel}>기업명</Text>
          <Text style={s.metaValue}>{data.tenantName}</Text>
        </View>
        <View style={s.metaRow}>
          <Text style={s.metaLabel}>사용 호실</Text>
          <Text style={s.metaValue}>{rooms}</Text>
        </View>
        <View style={s.metaRow}>
          <Text style={s.metaLabel}>청구 구성</Text>
          <Text style={s.metaValue}>{m}월 임대료 + {em}월 전기사용료</Text>
        </View>

        {/* 청구내역 표 */}
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.th, { flex: 2 }]}>{m}월 임대료 (부가세 포함)</Text>
            <Text style={[s.th, { flex: 2 }]}>{em}월 전기사용료</Text>
            <Text style={[s.th, { flex: 2 }]}>{m}월 청구료</Text>
            <Text style={[s.th, { flex: 2, borderRightWidth: 0 }]}>비고</Text>
          </View>
          <View style={s.tr}>
            <Text style={[s.tdR, { flex: 2 }]}>{formatWon(data.rentMgmt)}원</Text>
            <Text style={[s.tdR, { flex: 2 }]}>{formatWon(data.elecAmount)}원</Text>
            <Text style={[s.tdR, { flex: 2, fontWeight: "bold" }]}>{formatWon(data.total)}원</Text>
            <Text style={[s.td, { flex: 2, borderRightWidth: 0, fontSize: 8 }]}>
              {data.elecLines.length > 1
                ? data.elecLines.map((l) => `${l.room_code} ${formatWon(l.amount)}`).join(" / ")
                : ""}
            </Text>
          </View>
        </View>

        <Text style={s.per10}>10평당 전기사용 청구액: {formatWon(data.per10Billed)}원</Text>
        <Text style={s.note}>※ 매월 전기 총 사용량에 따라 청구 금액이 변동될 수 있습니다.</Text>

        <View style={s.bank}>
          <Text style={{ fontWeight: "bold", marginBottom: 4 }}>납부 계좌 안내</Text>
          <Text>{data.bankInfo}</Text>
        </View>

        <Text style={s.signature}>㈜ 포항연합기술지주 대표이사</Text>
      </Page>

      {/* metered 기업: 공장동 전력사용현황 명세 */}
      {data.factory && (
        <Page size="A4" style={s.page}>
          <Text style={s.h2}>{em}월 공장동 전력사용현황</Text>
          <View style={s.table}>
            <View style={s.thead}>
              <Text style={[s.th, { flex: 2 }]}>구분</Text>
              <Text style={[s.th, { flex: 1 }]}>사용량(kWh)</Text>
              <Text style={[s.th, { flex: 1 }]}>냉난방 배분</Text>
              <Text style={[s.th, { flex: 1 }]}>단가</Text>
              <Text style={[s.th, { flex: 1, borderRightWidth: 0 }]}>청구액</Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { flex: 2 }]}>F101</Text>
              <Text style={[s.tdR, { flex: 1 }]}>{data.factory.f101.usage}</Text>
              <Text style={[s.tdR, { flex: 1 }]}>+{data.factory.f101.hvacHalf}</Text>
              <Text style={[s.tdR, { flex: 1 }]}>{data.factory.unitPrice}</Text>
              <Text style={[s.tdR, { flex: 1, borderRightWidth: 0 }]}>{formatWon(data.factory.f101.amount)}</Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { flex: 2 }]}>F103</Text>
              <Text style={[s.tdR, { flex: 1 }]}>{data.factory.f103.usage}</Text>
              <Text style={[s.tdR, { flex: 1 }]}>+{data.factory.f103.hvacHalf}</Text>
              <Text style={[s.tdR, { flex: 1 }]}>{data.factory.unitPrice}</Text>
              <Text style={[s.tdR, { flex: 1, borderRightWidth: 0 }]}>{formatWon(data.factory.f103.amount)}</Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { flex: 2 }]}>F102 (공장동 전체 − F101·냉난방)</Text>
              <Text style={[s.tdR, { flex: 1 }]}>{data.factory.mainUsage}</Text>
              <Text style={[s.tdR, { flex: 1 }]}>-</Text>
              <Text style={[s.tdR, { flex: 1 }]}>{data.factory.unitPrice}</Text>
              <Text style={[s.tdR, { flex: 1, borderRightWidth: 0 }]}>{formatWon(data.factory.f102.amount)}</Text>
            </View>
          </View>
          <Text style={s.note}>※ 청구액은 천원 미만 절사. F102 차감액 = 단가 × (F101 사용량 + 냉난방 전체).</Text>
        </Page>
      )}
    </Document>
  )
}

export async function renderInvoicePdf(data: InvoicePdfInput): Promise<Buffer> {
  ensureFonts()
  return renderToBuffer(<InvoiceDocument data={data} />)
}
