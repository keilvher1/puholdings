"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChevronRight, CalendarRange } from "lucide-react"
import { APPLICATION_STATUS_LABELS, SUBMISSION_STATUS_LABELS } from "@/lib/programs"

interface PortalProgram {
  id: number
  title: string
  description: string | null
  category: string | null
  status: "open" | "closed"
  apply_start: string | null
  apply_end: string | null
  submit_deadline: string | null
  application_status: string | null
  submission_status: string | null
}

function myStatusBadges(p: PortalProgram) {
  const badges = []
  if (p.application_status) {
    const label = APPLICATION_STATUS_LABELS[p.application_status] || p.application_status
    badges.push(
      <Badge
        key="app"
        variant={p.application_status === "accepted" ? "default" : "secondary"}
      >
        {label}
      </Badge>
    )
  }
  if (p.submission_status) {
    const label = SUBMISSION_STATUS_LABELS[p.submission_status] || p.submission_status
    badges.push(
      <Badge key="sub" variant={p.submission_status === "resubmit_requested" ? "destructive" : "outline"}>
        제출: {label}
      </Badge>
    )
  }
  return badges
}

export default function PortalProgramsPage() {
  const [programs, setPrograms] = useState<PortalProgram[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/portal/programs", { credentials: "include" })
        const data = await res.json()
        if (data.success) setPrograms(data.programs)
        else setError(data.error || "프로그램을 불러오지 못했습니다")
      } catch {
        setError("서버 오류가 발생했습니다")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">프로그램</h1>
        <p className="mt-1 text-sm text-text-secondary">진행 중인 지원사업·교육 프로그램입니다</p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-text-secondary">불러오는 중...</p>
      ) : programs.length === 0 ? (
        <p className="py-10 text-center text-sm text-text-secondary">진행 중인 프로그램이 없습니다</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {programs.map((p) => (
            <Link key={p.id} href={`/portal/programs/${p.id}`}>
              <Card className="h-full transition-colors hover:border-gold/60">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-snug">{p.title}</CardTitle>
                    <ChevronRight className="h-4 w-4 shrink-0 text-text-secondary" />
                  </div>
                  <CardDescription className="flex flex-wrap items-center gap-1.5">
                    {p.category && <span>{p.category}</span>}
                    {p.status === "closed" && <Badge variant="secondary">모집 마감</Badge>}
                    {myStatusBadges(p)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {p.description && (
                    <p className="mb-3 line-clamp-2 text-sm text-text-secondary">{p.description}</p>
                  )}
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <CalendarRange className="h-3.5 w-3.5" />
                    신청 {p.apply_start || "-"} ~ {p.apply_end || "-"}
                    {p.submit_deadline && ` · 제출 마감 ${p.submit_deadline}`}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
