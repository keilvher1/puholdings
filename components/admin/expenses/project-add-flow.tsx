"use client"

import { useState } from "react"
import { ArrowLeft, ChevronRight, Loader2 } from "lucide-react"
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
import { InlineNotice } from "@/components/admin/expenses/ui"
import type { ProjectInput } from "@/lib/expenses"
import type { Attachment } from "@/lib/db"

// 프로젝트를 추가하는 두 가지 방법(자료에서 불러오기 / 직접 입력)을 고르고 진행하는 흐름.
// 온보딩(첫 프로젝트)과 "프로젝트 추가" 패널이 같은 컴포넌트를 쓴다.

type Method = "ai" | "manual"

export function ProjectAddFlow({
  onCreate,
  onFinished,
  existingNames = [],
}: {
  // 저장에 성공하면 null, 실패하면 화면에 보여 줄 오류 메시지를 돌려준다
  onCreate: (input: ProjectInput) => Promise<string | null>
  // 이 흐름에서 등록을 마쳤을 때(직접 입력 1건, 또는 초안을 모두 등록·건너뛰기 한 뒤)
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
      setError("빨간 칸을 확인하세요.")
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
          title="자료에서 불러오기"
          description="사업계획서·협약서·선정 공문(PDF·사진·텍스트, 최대 5개)에서 과제명·기간·총사업비·비목별 예산을 불러옵니다."
        />
        <MethodCard onClick={() => startManual()} title="직접 입력" description="프로젝트명만 필수. 예산·기간은 나중에 입력 가능." />
      </div>
    )
  }

  const nameTaken = existingNames.map(normalizeName).includes(normalizeName(form.name)) && form.name.trim() !== ""

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setMethod(null)} disabled={saving} className="-ml-2">
          <ArrowLeft className="h-4 w-4" />
          등록 방법 변경
        </Button>
        <span className="text-sm font-semibold text-dark">{method === "ai" ? "자료에서 불러오기" : "직접 입력"}</span>
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
          {nameTaken && <InlineNotice tone="warning">같은 이름의 프로젝트가 이미 있습니다.</InlineNotice>}
          {error && <InlineNotice tone="danger">{error}</InlineNotice>}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-warm-tan pt-3">
            <span className="mr-auto text-xs text-text-secondary">
              <span className="text-destructive">*</span> 필수
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

function MethodCard({ onClick, title, description }: { onClick: () => void; title: string; description: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full items-start gap-3 rounded-md border border-warm-tan bg-card p-4 text-left transition-colors hover:border-dark/40 hover:bg-warm-ivory/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-dark">{title}</span>
        <span className="mt-0.5 block text-sm text-text-secondary [word-break:keep-all]">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 self-center text-text-secondary" aria-hidden />
    </button>
  )
}
