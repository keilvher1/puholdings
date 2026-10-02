"use client"

// 관리비 정산 > 기준 정보 본문 — 안 탭 4개(단가·기본값 · 계약 · 호실 · 가져오기·내보내기)를 주소 ?tab=에 남긴다(계획서 3.4·4.3.9).
//   ?tab=rates(기본)|contracts|rooms|data, ?contract=ID(계약 시트 열기, "new"면 새 계약), ?tenant=ID(그 기업 계약만).
//   잘못된 값이면 기본 탭으로 연다(오류 화면 없음). contract·tenant만 있고 tab이 없으면 계약 탭(주소에 tab=contracts를 채운다).

import { useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useUrlStates } from "@/components/saas"
import { ContractsTab } from "./contracts-tab"
import { DataTab } from "./data-tab"
import { RatesTab } from "./rates-tab"
import { RoomsTab } from "./rooms-tab"
import type { RatesSummary } from "./rates-data"
import { CONTRACT_FILTER_DEFAULTS, resolveSettingsTab, type SettingsTab } from "./url-keys"

export type { SettingsTab }
const TABS: { value: SettingsTab; label: string }[] = [
  { value: "rates", label: "단가·기본값" },
  { value: "contracts", label: "계약" },
  { value: "rooms", label: "호실" },
  { value: "data", label: "가져오기·내보내기" },
]

export interface DraftBillsInfo {
  billMonth: string
  usageMonth: string
  count: number
}

export interface BillingSettingsProps {
  /** 단가·기본값 요약(서버 집계). null이면 불러오기 실패 */
  rates?: RatesSummary | null
  /** 입금 계좌 원문(PDF에 찍히는 글자, getBillingBankInfo().text) */
  bankText?: string | null
  /** getSupportContact() — 없으면 연락처 문장을 숨긴다 */
  supportContact?: string | null
  /** 마감 대상 청구월의 작성 중 정기 청구서(저장 뒤 "다시 만들기" 안내용) */
  draftBills?: DraftBillsInfo | null
  /** 정산표 내려받기 기본 청구월 */
  defaultExportMonth?: string
}

export function BillingSettings({ rates = null, bankText = null, supportContact = null, draftBills = null, defaultExportMonth }: BillingSettingsProps) {
  const [url, setUrl] = useUrlStates({ tab: "rates", contract: "", ...CONTRACT_FILTER_DEFAULTS })
  // tab이 없으면(기본값 rates) contract·tenant가 있을 때 계약 탭(3.4 "그 기업 계약만"). 모르는 값이면 기본 탭.
  // 그때는 주소에 tab=contracts를 남긴다 — 시트를 닫거나 기업 조건을 지워도 단가 탭으로 튀지 않게
  const { tab, fill: needsTab } = resolveSettingsTab(url)
  useEffect(() => {
    if (needsTab) setUrl({ tab: "contracts" })
  }, [needsTab, setUrl])

  return (
    <Tabs value={tab} onValueChange={(v) => setUrl({ tab: v, contract: null })} className="gap-0">
      <TabsList
        aria-label="기준 정보 보기"
        className="mb-5 grid h-auto w-full grid-cols-2 gap-1 rounded-md border border-warm-tan bg-warm-beige p-1 sm:inline-flex sm:w-fit sm:justify-start"
      >
        {TABS.map((t) => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className="h-auto min-h-9 flex-none rounded-[5px] border border-transparent px-3 py-1.5 text-[15px] font-medium text-[#3f3f4e] hover:text-dark data-[state=active]:border-warm-tan data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-dark data-[state=active]:shadow-none"
          >
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="rates">
        <RatesTab
          rates={rates}
          bankText={bankText}
          supportContact={supportContact}
          onShowContracts={(f) =>
            setUrl({ tab: "contracts", contract: null, status: null, q: null, tenant: null, rent: f.rent ?? null, mgmt: f.mgmt ?? null })
          }
        />
      </TabsContent>
      <TabsContent value="contracts">
        <ContractsTab draftBills={draftBills} />
      </TabsContent>
      <TabsContent value="rooms">
        <RoomsTab />
      </TabsContent>
      <TabsContent value="data">
        <DataTab defaultExportMonth={defaultExportMonth} />
      </TabsContent>
    </Tabs>
  )
}
