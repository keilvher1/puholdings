"use client"

// 호실 시트(오른쪽, 계획서 4.3.2). 머리 요약(입주 기업 ›·계약 시작·매달 청구·보증금) + 다음 동작.
// - 입주 중·퇴실 예정: [퇴실 처리] + "계약 조건 고치기 ›"(관리비 정산 › 기준 정보의 그 계약). 데이터는 기존 GET /api/admin/contracts?room_id=.
// - 공실: [입주 처리](공실에만, 가드 #11). 사용 불가: 안내 + 기준 정보 › 호실 링크.
// 매달 청구액은 lib/billing.ts의 calcContractCharge를 표시용으로만 부른다(move-model.monthlyCharge).

import { useCallback, useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CardSkeleton, DetailSheet, Notice, StatusBadge } from "@/components/saas"
import { billingSettingsHref, tenantsHref } from "@/lib/links"
import { MSG } from "@/lib/messages"
import { date, dateShort, won } from "@/lib/format"
import { MoveInForm, type TenantOption } from "./move-in-form"
import { MoveOutFlow, type ContractRow } from "./move-out-flow"
import { legendOf, monthlyCharge, monthlyText, pyeongText, type BoardRoom } from "./move-model"

export type SheetMode = "info" | "movein" | "moveout"

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-x-3 py-2.5">
      <dt className="text-[15px] text-[#3f3f4e]">{label}</dt>
      <dd className="min-w-0 text-[15px] text-dark [word-break:keep-all]">{children}</dd>
    </div>
  )
}

export function RoomSheet({
  room,
  mode,
  onModeChange,
  actionNotice,
  onDismissNotice,
  onClose,
  onReload,
  onActionDone,
  tenants,
  tenantsError,
  onRetryTenants,
  onTenantCreated,
  tenantRooms,
}: {
  room: BoardRoom | null
  mode: SheetMode
  onModeChange: (m: SheetMode) => void
  actionNotice: string | null
  onDismissNotice: () => void
  onClose: () => void
  onReload: () => Promise<BoardRoom[] | null>
  onActionDone: () => void
  tenants: TenantOption[] | null
  tenantsError: boolean
  onRetryTenants: () => void
  onTenantCreated: (t: TenantOption) => void
  tenantRooms: Map<number, string[]>
}) {
  const [contract, setContract] = useState<ContractRow | null>(null)
  const [cState, setCState] = useState<"idle" | "loading" | "error" | "ready">("idle")
  const [dirty, setDirty] = useState(false)
  const contractId = room?.contract_id ?? null
  const roomId = room?.id ?? null

  const loadContract = useCallback(async () => {
    if (!roomId || !contractId) {
      setContract(null)
      setCState("idle")
      return
    }
    setCState("loading")
    try {
      const res = await fetch(`/api/admin/contracts?room_id=${roomId}`, { credentials: "include", cache: "no-store" })
      const d = await res.json().catch(() => null)
      if (!res.ok || !d?.success) throw new Error("contracts")
      const c = (d.contracts as ContractRow[]).find((x) => Number(x.id) === contractId) ?? null
      setContract(c)
      setCState("ready")
    } catch {
      setCState("error")
    }
  }, [roomId, contractId])

  useEffect(() => {
    void loadContract()
  }, [loadContract])

  // 흐름이 바뀌거나 다른 호실을 열면 초기화(입주 폼·퇴실 흐름이 다시 알려 준다)
  useEffect(() => {
    setDirty(false)
  }, [mode, room?.id])

  if (!room) return <DetailSheet open={false} onOpenChange={() => {}} title="호실" />

  const kind = legendOf(room.state)
  const leavingDetail =
    kind === "leaving" && room.ended_at
      ? `${dateShort(room.ended_at)}${room.dday === null ? "" : room.dday === 0 ? " · 오늘" : ` · ${room.dday}일 남음`}`
      : undefined
  const charge = contract ? monthlyCharge(contract.pyeong_billed, contract.rent_unit_price, contract.mgmt_fee) : null
  const hasContract = !!room.contract_id && (kind === "occupied" || kind === "leaving")
  // 흐름이 끝나 결과 카드를 보는 중에는 상태가 바뀌어도(공실 → 입주 중) 같은 화면을 유지한다
  const showMoveIn = mode === "movein"
  const showMoveOut = mode === "moveout"

  return (
    <DetailSheet
      open
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
      title={`${room.building} ${room.code}호 · ${pyeongText(room.pyeong)}`}
      badge={<StatusBadge domain="room" status={room.state} detail={leavingDetail} />}
      dirty={dirty}
      size="md"
    >
      {showMoveIn ? (
        <MoveInForm
          key={`in-${room.id}`}
          room={room}
          tenants={tenants}
          tenantsError={tenantsError}
          onRetryTenants={onRetryTenants}
          tenantRooms={tenantRooms}
          onTenantCreated={onTenantCreated}
          onReload={onReload}
          onDone={onActionDone}
          onCancel={() => onModeChange("info")}
          onDirtyChange={setDirty}
        />
      ) : showMoveOut ? (
        <MoveOutFlow
          key={`out-${room.id}`}
          room={room}
          contract={contract}
          onReload={onReload}
          onDone={onActionDone}
          onCancel={() => onModeChange("info")}
          onDirtyChange={setDirty}
        />
      ) : (
        <div className="space-y-4">
          {actionNotice && (
            <Notice tone="info" onClose={onDismissNotice} closeLabel="안내 닫기">
              {actionNotice}
            </Notice>
          )}

          {hasContract && (
            <>
              {cState === "loading" && <CardSkeleton lines={4} label="계약 정보를 불러오는 중…" />}
              {cState === "error" && (
                <Notice
                  tone="danger"
                  action={
                    <Button type="button" variant="outline" size="sm" className="hover:bg-warm-beige hover:text-dark" onClick={() => void loadContract()}>
                      다시 시도
                    </Button>
                  }
                >
                  계약 정보를 불러오지 못했어요. {MSG.network}
                </Notice>
              )}
              <dl className="divide-y divide-warm-tan/70 rounded-md border border-warm-tan bg-card px-4">
                <Item label="입주 기업">
                  {room.tenant_id ? (
                    <Link href={tenantsHref({ tenant: room.tenant_id })} className="inline-flex items-center gap-0.5 font-medium text-link underline underline-offset-2">
                      {room.tenant_name}
                      <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  ) : (
                    room.tenant_name ?? "-"
                  )}
                </Item>
                {contract && (
                  <>
                    <Item label="계약 시작">{contract.start_date ? date(contract.start_date) : "기록 없음"}</Item>
                    <Item label="매달 청구">
                      <span className="tabular-nums">{monthlyText(charge)}</span>
                      <span className="block text-sm text-text-secondary">부가세 포함, 전기료 별도</span>
                    </Item>
                    <Item label="보증금">
                      <span className="tabular-nums">{contract.deposit_actual != null && contract.deposit_actual !== "" ? won(contract.deposit_actual) : "기록 없음"}</span>
                      <span className="text-text-secondary"> · 전기 {contract.elec_method === "metered" ? "계량기 사용량" : "면적 배분"}</span>
                    </Item>
                  </>
                )}
                {kind === "leaving" && room.ended_at && <Item label="퇴실 예정일">{`${date(room.ended_at)}${room.dday != null ? ` · ${room.dday}일 남음` : ""}`}</Item>}
              </dl>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button type="button" onClick={() => onModeChange("moveout")}>
                  퇴실 처리
                </Button>
                {room.contract_id && (
                  <Link
                    href={billingSettingsHref({ tab: "contracts", contract: room.contract_id })}
                    className="inline-flex min-h-8 items-center gap-0.5 text-[15px] text-link underline underline-offset-2"
                  >
                    계약 조건 고치기
                    <ChevronRight className="size-4" aria-hidden />
                  </Link>
                )}
              </div>
            </>
          )}

          {kind === "vacant" && (
            <>
              <dl className="divide-y divide-warm-tan/70 rounded-md border border-warm-tan bg-card px-4">
                <Item label="면적">{pyeongText(room.pyeong)}</Item>
                <Item label="상태">진행 중인 계약이 없는 공실이에요</Item>
              </dl>
              <div className="space-y-2">
                <Button type="button" className="w-full sm:w-auto" onClick={() => onModeChange("movein")}>
                  입주 처리
                </Button>
                <p className="text-sm text-text-secondary">입주 처리를 하면 계약이 만들어지고 호실이 바로 ‘입주 중’으로 바뀌어요.</p>
              </div>
            </>
          )}

          {kind === "unavailable" && (
            <Notice tone="info">
              사용 불가 호실이라 입주 처리를 할 수 없어요. 호실 상태는{" "}
              <Link href={billingSettingsHref({ tab: "rooms" })} className="text-link underline underline-offset-2">
                관리비 정산 › 기준 정보 › 호실
              </Link>
              에서 바꿔요.
            </Notice>
          )}
        </div>
      )}
    </DetailSheet>
  )
}
