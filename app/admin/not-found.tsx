import Link from "next/link"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/saas"

// 관리자 영역에서 없는 주소(계획서 4.1.5).
export default function AdminNotFound() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <EmptyState
        bordered
        title="찾는 화면이 없어요"
        description="주소가 바뀌었거나 지워진 항목일 수 있어요."
        action={
          <Button asChild size="sm">
            <Link href="/admin">홈으로</Link>
          </Button>
        }
      />
    </div>
  )
}
