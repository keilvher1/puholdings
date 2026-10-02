// 청구서 항목 목록(포털 청구서 상세) — 계획서 4.5.5-5.
//   휴대폰: 2열 목록(왼쪽 항목명 + 회색 설명 한 줄, 오른쪽 금액) — 표가 아니므로 금액이 화면 밖으로 나가지 않는다.
//   데스크톱(sm 이상): 3열 표(항목 | 설명 | 금액).
// 설명은 lib/bill-display.ts의 describeBillLine(저장값을 설명만, 다시 계산하지 않음). 면적 배분 전기료는 [계산 보기]로 식을 편다.
// 조정(manual) 라인은 "조정" 배지 + 저장된 라벨 + 금액(음수 그대로). 서버·클라이언트 공용(훅 없음).
//
// 사용 예:
//   <BillLineList lines={lines} />

import { Money, ToneBadge } from "@/components/saas"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { describeBillLine, type BillLineInput } from "@/lib/bill-display"

export interface BillLineItem extends BillLineInput {
  id: number
}

function Formula({ text }: { text: string }) {
  return (
    <details className="group mt-1 text-sm text-text-secondary">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-link underline underline-offset-2 hover:text-dark sm:min-h-8">
        계산 보기
      </summary>
      <p className="pb-1 leading-relaxed [word-break:keep-all]">{text}</p>
    </details>
  )
}

export function BillLineList({ lines }: { lines: BillLineItem[] }) {
  const rows = lines.map((l) => ({ line: l, d: describeBillLine(l, lines) }))
  if (rows.length === 0) {
    return <p className="py-3 text-base text-text-secondary">항목이 없어요.</p>
  }
  return (
    <>
      <ul className="divide-y divide-warm-tan sm:hidden" aria-label="청구 항목">
        {rows.map(({ line, d }) => {
          const manual = line.line_type === "manual"
          return (
            <li key={line.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 text-base font-medium text-dark [word-break:keep-all]">
                  {manual && <ToneBadge tone="neutral">조정</ToneBadge>}
                  <span>{d.label}</span>
                </p>
                {!manual && d.description && <p className="mt-0.5 text-sm leading-relaxed text-text-secondary [word-break:keep-all]">{d.description}</p>}
                {d.formula && <Formula text={d.formula} />}
              </div>
              <Money value={line.amount} className="shrink-0 pt-0.5 text-base font-semibold" />
            </li>
          )
        })}
      </ul>
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-sm text-[#3f3f4e]">항목</TableHead>
              <TableHead className="text-sm text-[#3f3f4e]">설명</TableHead>
              <TableHead className="text-right text-sm text-[#3f3f4e]">금액</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ line, d }) => {
              const manual = line.line_type === "manual"
              return (
                <TableRow key={line.id} className="hover:bg-transparent">
                  <TableCell className="min-h-11 py-3 align-top text-[15px] font-medium whitespace-normal text-dark [word-break:keep-all]">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {manual && <ToneBadge tone="neutral">조정</ToneBadge>}
                      {d.label}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 align-top text-[15px] whitespace-normal text-text-secondary [word-break:keep-all]">
                    {manual ? "센터에서 조정한 금액이에요" : (d.description ?? "")}
                    {d.formula && <Formula text={d.formula} />}
                  </TableCell>
                  <TableCell className="py-3 text-right align-top text-[15px]">
                    <Money value={line.amount} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
