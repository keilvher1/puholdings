import { join } from "node:path"
import {
  Document,
  Page,
  Text,
  View,
  Image,
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

export interface InvoicePdfInput {
  tenantName: string
  billMonth: string // YYYY-MM (청구월)
  rentMgmt: number // 임대료+관리비 (부가세 포함)
  elecAmount: number
  total: number
  per10Billed: number
  roomCodes: string[]
  elecLines: InvoiceElecLine[]
  manualLines?: { label: string; amount: number }[] // 수동 조정 (오입금 차감 등) — 청구료에 반영됨
  bankInfo: string
  issueDate: string // YYYY-MM-DD
}

const monthNum = (p: string) => Number(p.slice(5, 7))
const yearShort = (p: string) => p.slice(2, 4)
const roomLabel = (code: string) => (code.endsWith("호") ? code : `${code}호`)

// 원본 청구서(지출결의서) 양식 재현: 1페이지, ○ 청구내역 표(청구료 노란 강조),
// 비고에 호실별 전기 내역, 당월 10평당 단가(면적별 있을 때만), 납부계좌 2줄, 대표이사 직인.
const s = StyleSheet.create({
  page: { fontFamily: "Pretendard", fontSize: 11, paddingTop: 70, paddingHorizontal: 60, paddingBottom: 40, color: "#000" },
  title: { fontSize: 19, fontWeight: "bold", textAlign: "center", letterSpacing: 1 },
  meta: { marginTop: 52, marginLeft: 24 },
  metaRow: { flexDirection: "row", marginBottom: 10 },
  metaLabel: { fontWeight: "bold", width: 86 },
  metaValue: { fontWeight: "bold" },
  sectionRow: { marginTop: 34, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 },
  unit: { fontSize: 9, color: "#333" },
  table: { borderWidth: 1.2, borderColor: "#000" },
  thead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#000" },
  th: { paddingVertical: 8, paddingHorizontal: 4, fontWeight: "bold", textAlign: "center", borderRightWidth: 1, borderRightColor: "#000" },
  tr: { flexDirection: "row" },
  td: { paddingVertical: 14, paddingHorizontal: 6, textAlign: "center", borderRightWidth: 1, borderRightColor: "#000", justifyContent: "center" },
  hl: { backgroundColor: "#ffff00" },
  noteCell: { paddingVertical: 8, paddingHorizontal: 8, justifyContent: "center" },
  noteLine: { fontSize: 10, marginBottom: 3 },
  per10Row: { marginTop: 14, flexDirection: "row", justifyContent: "flex-end", alignItems: "center" },
  per10Label: { fontSize: 10.5 },
  per10Value: { fontSize: 10.5, marginLeft: 28 },
  varNote: { marginTop: 10, fontSize: 10, textAlign: "right", color: "#000" },
  adjust: { marginTop: 14, alignSelf: "flex-end", fontSize: 10 },
  bankTitle: { marginTop: 60, fontWeight: "bold", fontSize: 12 },
  bankLine: { marginTop: 12, fontSize: 11.5 },
  signatureRow: { marginTop: 60, flexDirection: "row", justifyContent: "center", alignItems: "center" },
  signature: { fontSize: 15, fontWeight: "bold", letterSpacing: 1 },
  seal: { width: 62, height: 62, marginLeft: 14 },
})

function InvoiceDocument({ data }: { data: InvoicePdfInput }) {
  const m = monthNum(data.billMonth)
  const em = monthNum(prevPeriod(data.billMonth))
  const yy = yearShort(data.billMonth)
  const eyy = yearShort(prevPeriod(data.billMonth))
  const rooms = data.roomCodes.map(roomLabel).join(", ")
  const hasArea = data.elecLines.some((l) => !l.metered)
  // 비고: 호실이 여러 개면 호실별 내역, 공장동 단일이면 <전기료> 표기 (원본 관행)
  const noteLines: string[] = []
  if (data.elecLines.length > 1) {
    for (const l of data.elecLines) noteLines.push(`${roomLabel(l.room_code)}  ${formatWon(l.amount)}원`)
  } else if (data.elecLines.length === 1 && data.elecLines[0].metered) {
    noteLines.push("<전기료>", `${roomLabel(data.elecLines[0].room_code)}  ${formatWon(data.elecLines[0].amount)}원`)
  }
  const bankLines = data.bankInfo.includes("\n") ? data.bankInfo.split("\n") : [data.bankInfo]

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>창업보육센터 입주기업 사용료 청구</Text>

        <View style={s.meta}>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>기 업 명 :</Text>
            <Text style={s.metaValue}>{data.tenantName}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>사용호실 :</Text>
            <Text style={s.metaValue}>{rooms}</Text>
          </View>
        </View>

        <View style={s.sectionRow}>
          <Text>○ 청구내역</Text>
          <Text style={s.unit}>(단위 : 원)</Text>
        </View>
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.th, { flex: 1 }]}>{yy}년 {m}월 임대료</Text>
            <Text style={[s.th, { flex: 1 }]}>{eyy}년 {em}월 전기사용료</Text>
            <Text style={[s.th, s.hl, { flex: 1 }]}>{yy}년 {m}월 청구료</Text>
            <Text style={[s.th, { flex: 1, borderRightWidth: 0 }]}>비고</Text>
          </View>
          <View style={s.tr}>
            <View style={[s.td, { flex: 1 }]}><Text>{formatWon(data.rentMgmt)}원</Text></View>
            <View style={[s.td, { flex: 1 }]}><Text>{formatWon(data.elecAmount)}원</Text></View>
            <View style={[s.td, s.hl, { flex: 1 }]}><Text style={{ fontWeight: "bold" }}>{formatWon(data.total)}원</Text></View>
            <View style={[s.noteCell, { flex: 1 }]}>
              {noteLines.map((t, i) => (
                <Text key={i} style={s.noteLine}>{t}</Text>
              ))}
            </View>
          </View>
        </View>

        {hasArea && (
          <View style={s.per10Row}>
            <Text style={s.per10Label}>당월 10평호실 당 전기사용 청구액</Text>
            <Text style={s.per10Value}>{formatWon(data.per10Billed)}원</Text>
          </View>
        )}
        <Text style={s.varNote}>※ 매월 전기 총 사용량에 따라 청구 금액 변동 예정</Text>

        {data.manualLines && data.manualLines.length > 0 && (
          <View style={s.adjust}>
            {data.manualLines.map((l, i) => (
              <Text key={i}>· {l.label}: {formatWon(l.amount)}원</Text>
            ))}
          </View>
        )}

        <Text style={s.bankTitle}>납부계좌 안내</Text>
        {bankLines.map((t, i) => (
          <Text key={i} style={s.bankLine}>{t}</Text>
        ))}

        <View style={s.signatureRow}>
          <Text style={s.signature}>㈜ 포항연합기술지주 대표이사</Text>
          <Image src={join(process.cwd(), "public", "seal.png")} style={s.seal} />
        </View>
      </Page>
    </Document>
  )
}

export async function renderInvoicePdf(data: InvoicePdfInput): Promise<Buffer> {
  ensureFonts()
  return renderToBuffer(<InvoiceDocument data={data} />)
}
