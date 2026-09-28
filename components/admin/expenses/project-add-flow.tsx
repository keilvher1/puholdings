"use client"

import { useState } from "react"
import { ArrowLeft, ChevronRight, Loader2, PenLine, Sparkles, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProjectAiImport } from "@/components/admin/expenses/project-ai-import"
import {
  ProjectForm,
  emptyProjectForm,
  formToInput,
  hasErrors,
  validateProjectForm,
  type ProjectFormErrors,
  type ProjectFormState,
} from "@/components/admin/expenses/project-form"
import { normalizeName } from "@/components/admin/expenses/client-helpers"
import type { ProjectInput } from "@/lib/expenses"
import type { Attachment } from "@/lib/db"

// 프로젝트를 추가하는 두 가지 방법(AI 자료 분석 / 직접 입력)을 고르고 진행하는 흐름.
// 온보딩(첫 프로젝트)과 "프로젝트 추가" 패널이 같은 컴포넌트를 쓴다.

type Method = "ai" | "manual"

export function ProjectAddFlow({
  onCreate,
  onFinished,
  existingNames = [],
}: {
  // 저장에 성공하면 null, 실패하면 화면에 보여 줄 오류 메시지를 돌려준다
  onCreate: (input: ProjectInput) => Promise<string | null>
  // 이 흐름에서 등록을 마쳤을 때(직접 입력 1건, 또는 AI 초안을 모두 등록·건너뛰기 한 뒤)
  onFinished: (createdCount: number) => void
  existingNames?: string[]
}) {
  const [method, setMethod] = useState<Method | null>(null)
  const [form, setForm] = useState<ProjectFormState>(emptyProjectForm)
  const [errors, setErrors] = useState<ProjectFormErrors>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const startManual = (sourceFiles: Attachment[] = []) => {
    setForm({ ...emptyProjectForm(), source_files: sourceFiles })
    setErrors({})
    setError("")
    setMethod("manual")
  }

  const submitManual = async () => {
    const e = validateProjectForm(form)
    setErrors(e)
    if (hasErrors(e)) {
      setError("빨간색으로 표시된 칸을 확인해 주세요.")
      return
    }
    setSaving(true)
    setError("")
    const err = await onCreate(formToInput(form))
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    setForm(emptyProjectForm())
    onFinished(1)
  }

  if (method === null) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <MethodCard
          onClick={() => setMethod("ai")}
          icon={<Sparkles className="h-5 w-5" />}
          title="사업 자료로 자동 입력"
          badge="AI · 추천"
          description="사업계획서·협약서·선정 공문을 올리면 AI가 과제명, 기간, 총사업비, 비목별 예산을 채워 드립니다."
          points={["PDF·사진·텍스트 최대 5개", "채워진 값은 확인하고 고칠 수 있어요", "보통 1분 안에 끝나요"]}
        />
        <MethodCard
          onClick={() => startManual()}
          icon={<PenLine className="h-5 w-5" />}
          title="직접 입력"
          description="자료가 없거나 빠르게 시작하고 싶을 때. 프로젝트 이름만 적어도 바로 증빙을 올릴 수 있습니다."
          points={["필수 항목은 프로젝트명 하나", "예산·기간은 나중에 채워도 돼요"]}
        />
      </div>
    )
  }

  const nameTaken = existingNames.map(normalizeName).includes(normalizeName(form.name)) && form.name.trim() !== ""

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setMethod(null)} disabled={saving} className="-ml-2">
          <ArrowLeft className="h-4 w-4" />
          방법 다시 고르기
        </Button>
        <span className="text-sm font-semibold text-dark">
          {method === "ai" ? "사업 자료로 자동 입력 (AI)" : "직접 입력"}
        </span>
      </div>

      {method === "ai" ? (
        <ProjectAiImport
          onCreate={onCreate}
          onFinished={onFinished}
          onManual={(files) => startManual(files)}
          existingNames={existingNames}
        />
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submitManual()
          }}
        >
          <ProjectForm
            value={form}
            onChange={(next) => {
              setForm(next)
              if (error) setError("")
            }}
            errors={errors}
            idPrefix="manual"
            disabled={saving}
          />
          {nameTaken && (
            <p className="flex gap-1.5 text-xs text-amber-800 [word-break:keep-all]">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              같은 이름의 프로젝트가 이미 있습니다. 중복 등록이 아닌지 확인하세요.
            </p>
          )}
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive [word-break:keep-all]">{error}</p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-warm-tan/60 pt-3">
            <span className="mr-auto text-xs text-text-tertiary">
              <span className="text-destructive">*</span> 표시만 필수입니다
            </span>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  등록 중…
                </>
              ) : (
                "프로젝트 등록"
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

function MethodCard({
  onClick,
  icon,
  title,
  badge,
  description,
  points,
}: {
  onClick: () => void
  icon: React.ReactNode
  title: string
  badge?: string
  description: string
  points: string[]
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full flex-col rounded-xl border-2 border-warm-tan bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-gold hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/15 text-gold">{icon}</span>
        <span className="text-base font-bold text-dark">{title}</span>
        {badge && (
          <span className="ml-auto rounded-full bg-gold px-2 py-0.5 text-[11px] font-semibold text-dark">{badge}</span>
        )}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-text-secondary [word-break:keep-all]">{description}</p>
      <ul className="mt-3 grid gap-1">
        {points.map((p) => (
          <li key={p} className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span className="h-1 w-1 shrink-0 rounded-full bg-gold" />
            {p}
          </li>
        ))}
      </ul>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-dark group-hover:text-gold">
        이 방법으로 시작
        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  )
}
