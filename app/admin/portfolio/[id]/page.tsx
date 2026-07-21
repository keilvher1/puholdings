import { redirect, notFound } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { PortfolioForm } from "@/components/admin/portfolio-form"
import type { ComponentProps } from "react"

type PortfolioInitialData = ComponentProps<typeof PortfolioForm>["initialData"]

async function getPortfolioItem(id: string): Promise<PortfolioInitialData> {
  if (id === "new") return null

  const sql = getDb()
  if (!sql) return null

  try {
    const rows = await sql`SELECT * FROM portfolio_companies WHERE id = ${parseInt(id)}`
    return (rows[0] as NonNullable<PortfolioInitialData>) || null
  } catch {
    return null
  }
}

export default async function AdminPortfolioEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session) redirect("/admin/login")

  const { id } = await params
  const portfolio = await getPortfolioItem(id)

  if (id !== "new" && !portfolio) {
    notFound()
  }

  return (
    <div className="p-5 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">
          {id === "new" ? "기업 추가" : "기업 정보 수정"}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {id === "new" ? "새로운 포트폴리오 기업을 추가합니다" : "기업 정보를 수정합니다"}
        </p>
      </div>

      <PortfolioForm initialData={portfolio} />
    </div>
  )
}
