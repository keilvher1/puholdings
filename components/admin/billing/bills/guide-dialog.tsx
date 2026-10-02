"use client"

// 납부 안내 문구 대화상자(계획서 4.4.7 B-9) — 메일이 꺼진 운영에서도 문자·카카오톡으로 보낼 수 있게 문구를 보여 주고 복사한다.
// 계좌는 서버에서 읽은 getBillingBankInfo()(PDF와 같은 원문)를 prop으로 받는다.

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { CopyButton } from "@/components/saas"
import { paymentGuideText, type BankForGuide, type BillRow } from "./bill-model"

export interface GuideTarget {
  tenantName: string
  bills: Pick<BillRow, "period" | "total_amount">[]
}

export function GuideDialog({
  target,
  onOpenChange,
  bank,
  phone,
}: {
  target: GuideTarget | null
  onOpenChange: (open: boolean) => void
  bank: BankForGuide
  phone: string | null
}) {
  const text = target ? paymentGuideText({ tenantName: target.tenantName, bills: target.bills, bank, phone }) : ""
  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="app-shell sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle className="text-lg font-semibold text-dark">납부 안내 문구</DialogTitle>
          <DialogDescription className="text-[15px] leading-relaxed text-[#3f3f4e] [word-break:keep-all]">
            복사해서 문자나 카카오톡으로 보내요. 이 화면에서는 메일이 나가지 않아요.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="guide-text" className="sr-only">
            납부 안내 문구
          </Label>
          <Textarea id="guide-text" readOnly value={text} rows={5} className="bg-warm-ivory text-[15px] leading-relaxed" onFocus={(e) => e.currentTarget.select()} />
        </div>
        <DialogFooter className="flex-row flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <CopyButton value={text} label="문구 복사" variant="default" successMessage="납부 안내 문구를 복사했어요" />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
