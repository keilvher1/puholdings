"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronDown, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { BusyButton, CardSkeleton, ConfirmDialog, EmptyState, Notice, Section, toastSuccess, useDelayedFlag } from "@/components/saas"
import { ProjectAddFlow } from "@/components/admin/expenses/project-add-flow"
import { ProjectCard } from "@/components/admin/expenses/project-card"
import {
  ProjectForm,
  formToInput,
  hasErrors,
  projectToForm,
  validateProjectForm,
  type ProjectFormErrors,
  type ProjectFormState,
} from "@/components/admin/expenses/project-form"
import { jsonInit, requestJson } from "@/components/admin/expenses/client-helpers"
import { friendlyError, MSG } from "@/lib/messages"
import { expensesHref } from "@/lib/links"
import type { ExpenseProject, ProjectInput } from "@/lib/expenses"

// 사업·프로젝트 화면(계획서 4.2.8).
// - 진행 중 프로젝트가 없거나 ?onboarding=1로 들어오면 등록 화면(두 가지 등록 방법)을 먼저 보여 준다.
//   처음 쓰는 사람에게는 위에 4단계 체크리스트(K-5)를 보여 준다. 온보딩에서 등록을 마치면 그 프로젝트로 증빙 올리기로 간다.
// - 평소에는 프로젝트 카드 목록(집행률·비목 초과) + 추가·수정·종료/다시 진행·삭제.
// - 등록 뒤에는 토스트 + [이 프로젝트로 증빙 올리기](K-4). 종료·삭제는 확인창(처리 중 잠금, 실패하면 창 안에 안내).

type Mode = "loading" | "onboarding" | "list"

type Confirm =
  | { kind: "close"; project: ExpenseProject }
  | { kind: "delete"; project: ExpenseProject }
  | { kind: "blocked"; project: ExpenseProject }

export function ProjectManager({ initialOnboarding = false }: { initialOnboarding?: boolean }) {
  const router = useRouter()
  const [projects, setProjects] = useState<ExpenseProject[]>([])
  const [mode, setMode] = useState<Mode>("loading")
  const [loadError, setLoadError] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const [createdHere, setCreatedHere] = useState(0)
  const lastCreated = useRef<ExpenseProject | null>(null)

  const [created, setCreated] = useState<{ count: number; project: ExpenseProject | null } | null>(null)
  const [actionError, setActionError] = useState("")

  const [addOpen, setAddOpen] = useState(false)
  const [addKey, setAddKey] = useState(0)
  const [showClosed, setShowClosed] = useState(false)

  const [editing, setEditing] = useState<ExpenseProject | null>(null)
  const [editForm, setEditForm] = useState<ProjectFormState | null>(null)
  const [editErrors, setEditErrors] = useState<ProjectFormErrors>({})
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState("")

  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(
    async (quiet = false) => {
      if (quiet) setRefreshing(true)
      const r = await requestJson<{ projects: ExpenseProject[] }>("/api/admin/expenses/projects")
      setRefreshing(false)
      if (!r.ok) {
        setLoadError(friendlyError(r.status, r.error, MSG.loadFailed))
        return
      }
      const list = Array.isArray(r.data.projects) ? r.data.projects : []
      setLoadError("")
      setProjects(list)
      // 화면 모드는 처음 불러올 때 한 번만 정한다(온보딩 중 등록해도 초안 화면이 사라지지 않게)
      setMode((m) => {
        if (m !== "loading") return m
        const active = list.filter((p) => p.status === "active").length
        return list.length === 0 || active === 0 || initialOnboarding ? "onboarding" : "list"
      })
    },
    [initialOnboarding],
  )

  useEffect(() => {
    void load()
  }, [load])

  const active = projects.filter((p) => p.status === "active")
  const closed = projects.filter((p) => p.status === "closed")
  const existingNames = projects.map((p) => p.name)

  // ── 등록 ──────────────────────────────────────────────────────────────────
  const createProject = useCallback(
    async (input: ProjectInput): Promise<string | null> => {
      const r = await requestJson<{ project: ExpenseProject }>("/api/admin/expenses/projects", jsonInit("POST", input))
      if (!r.ok) return friendlyError(r.status, r.error, MSG.saveFailed)
      lastCreated.current = r.data.project ?? null
      setCreatedHere((n) => n + 1)
      void load(true)
      router.refresh()
      return null
    },
    [load, router],
  )

  const finishOnboarding = useCallback(
    (count: number) => {
      const p = count === 1 ? lastCreated.current : null
      toastSuccess(count > 1 ? `프로젝트 ${count}개를 등록했어요` : "프로젝트를 등록했어요")
      setNavigating(true)
      router.push(expensesHref({ project_id: p?.id ?? null }))
    },
    [router],
  )

  const finishAdd = useCallback((count: number) => {
    setAddOpen(false)
    setAddKey((k) => k + 1)
    const p = count === 1 ? lastCreated.current : null
    toastSuccess(count > 1 ? `프로젝트 ${count}개를 등록했어요` : `‘${p?.name ?? "프로젝트"}’를 등록했어요`)
    setCreated({ count, project: p })
  }, [])

  const leaveOnboarding = () => {
    setMode("list")
    if (initialOnboarding) router.replace("/admin/expenses/projects")
  }

  // ── 수정 ──────────────────────────────────────────────────────────────────
  const openEdit = (p: ExpenseProject) => {
    setEditing(p)
    setEditForm(projectToForm(p))
    setEditErrors({})
    setEditError("")
  }

  const closeEdit = () => {
    if (editSaving) return
    setEditing(null)
    setEditForm(null)
  }

  const saveEdit = async () => {
    if (!editing || !editForm) return
    const e = validateProjectForm(editForm)
    setEditErrors(e)
    if (hasErrors(e)) {
      setEditError("표시한 칸을 확인해 주세요.")
      return
    }
    setEditSaving(true)
    setEditError("")
    const r = await requestJson("/api/admin/expenses/projects", jsonInit("PUT", { id: editing.id, ...formToInput(editForm), status: editing.status }))
    setEditSaving(false)
    if (!r.ok) {
      setEditError(friendlyError(r.status, r.error, MSG.saveFailed))
      return
    }
    setEditing(null)
    setEditForm(null)
    toastSuccess("프로젝트 정보를 저장했어요")
    void load(true)
    router.refresh()
  }

  // ── 종료·다시 진행·삭제 ────────────────────────────────────────────────────
  const setStatus = async (p: ExpenseProject, status: "active" | "closed"): Promise<string | null> => {
    setBusyId(p.id)
    // 상태만 보낸다(다른 필드는 서버가 기존 값을 유지)
    const r = await requestJson("/api/admin/expenses/projects", jsonInit("PUT", { id: p.id, status }))
    setBusyId(null)
    if (!r.ok) return friendlyError(r.status, r.error, MSG.saveFailed)
    toastSuccess(status === "closed" ? `‘${p.name}’ 프로젝트를 종료했어요. 저장한 증빙은 그대로예요` : `‘${p.name}’ 프로젝트를 다시 진행해요`)
    void load(true)
    router.refresh()
    return null
  }

  const deleteProject = async (p: ExpenseProject): Promise<string | null> => {
    setBusyId(p.id)
    const r = await requestJson("/api/admin/expenses/projects", jsonInit("DELETE", { id: p.id }))
    setBusyId(null)
    if (!r.ok) return friendlyError(r.status, r.error, MSG.deleteFailed)
    toastSuccess(`‘${p.name}’ 프로젝트를 삭제했어요`)
    void load(true)
    router.refresh()
    return null
  }

  const askDelete = (p: ExpenseProject) => setConfirm({ kind: p.receipt_count > 0 ? "blocked" : "delete", project: p })
  const askToggle = async (p: ExpenseProject) => {
    if (p.status === "active") {
      setConfirm({ kind: "close", project: p })
      return
    }
    setActionError("")
    const err = await setStatus(p, "active")
    if (err) setActionError(err)
  }

  const showSkeleton = useDelayedFlag(mode === "loading" && !loadError)

  // ── 화면 ─────────────────────────────────────────────────────────────────
  if (mode === "loading") {
    if (loadError) {
      return <EmptyState kind="error" bordered title="프로젝트 목록을 불러오지 못했어요" description={loadError} onRetry={() => void load()} />
    }
    return showSkeleton ? (
      <div className="grid gap-4 lg:grid-cols-2">
        <CardSkeleton lines={5} label="프로젝트를 불러오는 중…" />
        <CardSkeleton lines={5} label="프로젝트를 불러오는 중…" />
      </div>
    ) : (
      <div className="h-40" aria-busy="true" />
    )
  }

  if (navigating) {
    return (
      <Section className="text-center">
        <p className="py-6 text-base font-semibold text-dark">프로젝트를 등록했어요. 증빙 올리기로 가는 중…</p>
      </Section>
    )
  }

  if (mode === "onboarding") {
    // 이 화면에서 새로 등록한 프로젝트는 빼고 센다(등록 직후 목록을 다시 불러와도 제목이 바뀌지 않게)
    const prevTotal = Math.max(0, projects.length - createdHere)
    const prevActive = Math.max(0, active.length - createdHere)
    const heading = prevTotal === 0 ? "아직 등록한 프로젝트가 없어요" : prevActive === 0 ? "진행 중인 프로젝트가 없어요" : "새 프로젝트"
    return (
      <div className="grid gap-4">
        {prevTotal === 0 && <FirstUseChecklist />}
        <div>
          <h2 className="text-lg font-semibold text-dark">{heading}</h2>
          <p className="mt-1 text-[15px] text-text-secondary [word-break:keep-all]">
            {prevActive === 0 ? "증빙을 올리려면 사업(프로젝트)을 먼저 등록해 주세요." : "등록을 마치면 그 프로젝트로 증빙 올리기 화면이 열려요."}
          </p>
        </div>

        {projects.length > 0 && createdHere === 0 && (
          <Notice
            action={
              <Button variant="outline" size="sm" className="bg-card hover:bg-warm-beige" onClick={leaveOnboarding}>
                등록한 프로젝트 보기
              </Button>
            }
          >
            {active.length === 0
              ? `진행 중인 프로젝트가 없어요. 종료한 프로젝트 ${closed.length}개는 목록에서 다시 진행할 수 있어요.`
              : `등록한 프로젝트가 ${projects.length}개 있어요.`}
          </Notice>
        )}

        <div>
          <h3 className="mb-2 text-[15px] font-semibold text-dark">등록 방법</h3>
          <ProjectAddFlow onCreate={createProject} onFinished={finishOnboarding} existingNames={existingNames} />
        </div>
      </div>
    )
  }

  const card = (p: ExpenseProject) => (
    <ProjectCard
      key={p.id}
      project={p}
      busy={busyId === p.id}
      onEdit={() => openEdit(p)}
      onToggleStatus={() => void askToggle(p)}
      onDelete={() => askDelete(p)}
    />
  )

  return (
    <div className="grid gap-4">
      {created && (
        <Notice
          tone="success"
          onClose={() => setCreated(null)}
          action={
            <Button asChild size="sm">
              <Link href={expensesHref({ project_id: created.project?.id ?? null })}>
                {created.project ? "이 프로젝트로 증빙 올리기" : "증빙 올리기"}
              </Link>
            </Button>
          }
        >
          {created.count > 1 ? `프로젝트 ${created.count}개를 등록했어요.` : `‘${created.project?.name ?? "프로젝트"}’를 등록했어요.`} 이제 증빙을 올릴 수 있어요.
        </Notice>
      )}
      {actionError && (
        <Notice tone="danger" onClose={() => setActionError("")}>
          {actionError}
        </Notice>
      )}
      {loadError && (
        <Notice
          tone="danger"
          action={
            <Button size="sm" variant="outline" className="bg-card hover:bg-warm-beige" onClick={() => void load(true)}>
              다시 시도
            </Button>
          }
        >
          최신 목록을 불러오지 못했어요. {loadError}
        </Notice>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-3 text-[15px] text-text-secondary">
          <span>
            진행 중 <b className="font-semibold tabular-nums text-dark">{active.length}</b>개
          </span>
          {closed.length > 0 && (
            <span>
              종료 <b className="font-semibold tabular-nums text-dark">{closed.length}</b>개
            </span>
          )}
          {refreshing && <span className="text-sm">새로 고치는 중…</span>}
        </p>
        {!addOpen && (
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" aria-hidden />
            프로젝트 추가
          </Button>
        )}
      </div>

      {addOpen && (
        <Section
          title="새 프로젝트"
          headingLevel={3}
          actions={
            <Button variant="ghost" size="sm" className="hover:bg-warm-beige" onClick={() => setAddOpen(false)} aria-label="새 프로젝트 닫기">
              <X className="size-4" aria-hidden />
              닫기
            </Button>
          }
        >
          <ProjectAddFlow key={addKey} onCreate={createProject} onFinished={finishAdd} existingNames={existingNames} />
        </Section>
      )}

      {projects.length === 0 && !addOpen && (
        <EmptyState
          bordered
          title="아직 등록한 프로젝트가 없어요"
          description="프로젝트를 등록하면 증빙을 올릴 수 있어요."
          action={
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-4" aria-hidden />
              프로젝트 추가
            </Button>
          }
        />
      )}

      {active.length > 0 && <div className="grid gap-4 lg:grid-cols-2">{active.map(card)}</div>}
      {active.length === 0 && closed.length > 0 && !addOpen && (
        <EmptyState bordered title="진행 중인 프로젝트가 없어요" description="새 프로젝트를 추가하거나 아래 종료한 프로젝트를 다시 진행해 주세요." />
      )}

      {closed.length > 0 && (
        <section className="mt-4">
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className="mb-3 flex min-h-9 items-center gap-1.5 rounded-sm text-[15px] font-semibold text-dark hover:underline hover:underline-offset-2"
            aria-expanded={showClosed}
          >
            <ChevronDown className={`size-4 text-text-secondary ${showClosed ? "" : "-rotate-90"}`} aria-hidden />
            종료한 프로젝트
            <span className="font-normal tabular-nums text-text-secondary">{closed.length}개</span>
          </button>
          {showClosed && <div className="grid gap-4 lg:grid-cols-2">{closed.map(card)}</div>}
        </section>
      )}

      {/* 수정 대화상자 */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && closeEdit()}>
        <DialogContent className="app-shell max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>프로젝트 정보 수정</DialogTitle>
            <DialogDescription>저장하면 바로 반영돼요.</DialogDescription>
          </DialogHeader>
          {editing && editForm && (
            <>
              <ProjectForm
                value={editForm}
                onChange={(next) => {
                  setEditForm(next)
                  if (editError) setEditError("")
                }}
                errors={editErrors}
                idPrefix={`edit-${editing.id}`}
                disabled={editSaving}
              />
              {editing.receipt_count > 0 && (
                <Notice>
                  연결된 증빙이 <b className="font-semibold tabular-nums">{editing.receipt_count.toLocaleString("ko-KR")}건</b> 있어요. 비목 이름을
                  바꿔도 이미 저장한 증빙의 비목은 바뀌지 않아요.
                </Notice>
              )}
              {editError && <Notice tone="danger">{editError}</Notice>}
            </>
          )}
          <DialogFooter>
            <Button variant="outline" className="hover:bg-warm-beige" onClick={closeEdit} disabled={editSaving}>
              닫기
            </Button>
            <BusyButton busy={editSaving} onClick={() => void saveEdit()}>
              저장
            </BusyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 종료·삭제 확인 — 처리 중 잠금, 실패하면 창 안에 안내 */}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        tone={confirm?.kind === "delete" ? "danger" : "default"}
        title={
          confirm?.kind === "close"
            ? `‘${confirm.project.name}’ 프로젝트를 종료할까요?`
            : confirm?.kind === "delete"
              ? `‘${confirm.project.name}’ 프로젝트를 삭제할까요?`
              : "증빙이 있는 프로젝트는 삭제할 수 없어요"
        }
        body={
          confirm?.kind === "close"
            ? "증빙 올리기의 프로젝트 목록에서만 빠져요. 저장한 증빙·증빙 내역·엑셀은 그대로이고, ⋯ 메뉴의 ‘다시 진행하기’로 되돌릴 수 있어요."
            : confirm?.kind === "delete"
              ? "저장한 증빙이 없는 프로젝트예요. 삭제하면 되돌릴 수 없으니, 잘못 만든 프로젝트가 아니면 ‘종료하기’를 써 주세요."
              : confirm
                ? `‘${confirm.project.name}’에 저장한 증빙이 ${confirm.project.receipt_count.toLocaleString("ko-KR")}건 있어요. 삭제 대신 ‘종료하기’를 써 주세요(증빙 올리기 목록에서만 빠져요).`
                : undefined
        }
        confirmLabel={confirm?.kind === "delete" ? "삭제하기" : "종료하기"}
        busyLabel={confirm?.kind === "delete" ? "삭제 중…" : "종료하는 중…"}
        failedTitle={confirm?.kind === "delete" ? "삭제하지 못했어요" : "종료하지 못했어요"}
        onConfirm={async () => {
          if (!confirm) return
          if (confirm.kind === "blocked" && confirm.project.status !== "active") {
            setConfirm(null)
            return
          }
          const err = confirm.kind === "delete" ? await deleteProject(confirm.project) : await setStatus(confirm.project, "closed")
          if (err) return { error: err }
        }}
      />
    </div>
  )
}

// 처음 쓰는 사람 체크리스트(K-5) — 등록한 프로젝트가 하나도 없을 때만. 단계는 실제로 끝나야 체크된다(지금은 모두 시작 전).
function FirstUseChecklist() {
  const steps = [
    { title: "과제 등록", note: "약 3분 · 사업계획서를 올리면 자동으로 채워요" },
    { title: "비목별 예산 입력", note: "약 5분 · 등록하면서 함께 넣어도 돼요" },
    { title: "첫 증빙 올리기", note: "영수증·세금계산서 사진이나 PDF" },
    { title: "데스크톱 앱 설치(선택)", note: "폴더에 넣으면 자동으로 올라와요" },
  ]
  return (
    <Section title="처음 쓰는 순서" headingLevel={2} description="아래 순서대로 하면 증빙 처리를 시작할 수 있어요.">
      <ol className="grid gap-2 sm:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3 rounded-md border border-warm-tan px-3 py-2.5">
            <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-warm-tan text-sm font-semibold tabular-nums text-dark" aria-hidden>
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-medium text-dark">
                {s.title}
                {i === 3 && (
                  <>
                    {" "}
                    <Link href="/admin/expenses/desktop" className="text-sm font-normal text-link underline underline-offset-2">
                      설치 안내
                    </Link>
                  </>
                )}
              </span>
              <span className="block text-sm text-text-secondary [word-break:keep-all]">{s.note}</span>
            </span>
          </li>
        ))}
      </ol>
    </Section>
  )
}
