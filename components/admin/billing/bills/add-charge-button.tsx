"use client"

// 페이지 헤더의 주 버튼 [추가 청구 만들기] — 주소에 ?add=1을 넣어 BillsScreen의 추가 청구 시트를 연다(서버 컴포넌트 PageHeader의 primary 슬롯용).

import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUrlState } from "@/components/saas"

export function AddChargeButton() {
  const [, setAdd] = useUrlState("add", "")
  return (
    <Button type="button" onClick={() => setAdd("1")}>
      <Plus aria-hidden />
      추가 청구 만들기
    </Button>
  )
}
