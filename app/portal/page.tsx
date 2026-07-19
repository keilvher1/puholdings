import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Receipt, CalendarRange } from "lucide-react"

export default function PortalDashboardPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">대시보드</h1>
        <p className="mt-1 text-sm text-text-secondary">입주기업 포털에 오신 것을 환영합니다</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4 text-gold" />
              청구서
            </CardTitle>
            <CardDescription>관리비·임대료 청구 내역</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="py-6 text-center text-sm text-text-secondary">준비 중입니다</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarRange className="h-4 w-4 text-gold" />
              프로그램
            </CardTitle>
            <CardDescription>지원 프로그램 및 일정</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="py-6 text-center text-sm text-text-secondary">준비 중입니다</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
