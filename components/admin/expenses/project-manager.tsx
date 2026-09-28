"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, FolderPlus, Loader2, Plus, RefreshCw, TriangleAlert, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AdminCard, HelpNote, StepIntro } from "@/components/admin/admin-ui"
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
import { NoticeBanner, type Notice } from "@/components/admin/expenses/notice-banner"
import { jsonInit, requestJson } from "@/components/admin/expenses/client-helpers"
import type { ExpenseProject, ProjectInput } from "@/lib/expenses"

// 사업·프로젝트 화면.
// - 활성 프로젝트가 없거나 ?onboarding=1 로 들어오면 온보딩(두 가지 등록 방법)을 먼저 보여 준다.
//   온보딩에서 등록을 마치면 곧바로 증빙 올리기(/admin/expenses)로 이동한다.
// - 평소에는 프로젝트 카드 목록(집행률) + 추가·수정·종료/재개·삭제.

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

  const [notice, setNotice] = useState<Notice | null>(null)
  const clearNotice = useCallback(() => setNotice(null), [])

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
        setLoadError(r.error)
        return
      }
      const list = Array.isArray(r.data.projects) ? r.data.projects : []
      setLoadError("")
      setProjects(list)
      // 화면 모드는 처음 불러올 때 한 번만 정한다(온보딩 중 등록해도 AI 초안 화면이 사라지지 않게)
      setMode((m) => {
        if (m !== "loading") return m
        const active = list.filter((p) => p.status === "active").length
        return list.length === 0 || active === 0 || initialOnboarding ? "onboarding" : "list"
      })
    },
    [initialOnboarding]
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
      if (!r.ok) return r.error
      setCreatedHere((n) => n + 1)
      void load(true)
      return null
    },
    [load]
  )

  const finishOnboarding = useCallback(() => {
    setNavigating(true)
    router.push("/admin/expenses")
  }, [router])

  const finishAdd = useCallback((count: number) => {
    setAddOpen(false)
    setAddKey((k) => k + 1)
    setNotice({
      tone: "success",
      text: count > 1 ? `프로젝트 ${count}개를 등록했습니다.` : "프로젝트를 등록했습니다.",
      link: { href: "/admin/expenses", label: "바로 증빙 올리기" },
    })
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
      setEditError("빨간색으로 표시된 칸을 확인해 주세요.")
      return
    }
    setEditSaving(true)
    setEditError("")
    const r = await requestJson("/api/admin/expenses/projects", jsonInit("PUT", { id: editing.id, ...formToInput(editForm), status: editing.status }))
    setEditSaving(false)
    if (!r.ok) {
      setEditError(r.error)
      return
    }
    setEditing(null)
    setEditForm(null)
    setNotice({ tone: "success", text: "프로젝트 정보를 저장했습니다." })
    void load(true)
  }

  // ── 종료·재개·삭제 ────────────────────────────────────────────────────────
  const setStatus = async (p: ExpenseProject, status: "active" | "closed") => {
    setBusyId(p.id)
    // 상태만 보낸다(다른 필드는 서버가 기존 값을 유지)
    const r = await requestJson("/api/admin/expenses/projects", jsonInit("PUT", { id: p.id, status }))
    setBusyId(null)
    if (!r.ok) {
      setNotice({ tone: "error", text: r.error })
      return
    }
    setNotice({
      tone: "success",
      text:
        status === "closed"
          ? `‘${p.name}’ 프로젝트를 종료했습니다. 증빙 올리기의 프로젝트 목록에서 빠지며, 저장된 증빙은 그대로 남습니다.`
          : `‘${p.name}’ 프로젝트를 다시 진행 중으로 바꿨습니다.`,
    })
    void load(true)
  }

  const deleteProject = async (p: ExpenseProject) => {
    setBusyId(p.id)
    const r = await requestJson("/api/admin/expenses/projects", jsonInit("DELETE", { id: p.id }))
    setBusyId(null)
    if (!r.ok) {
      setNotice({ tone: "error", text: r.error })
      return
    }
    setNotice({ tone: "success", text: `‘${p.name}’ 프로젝트를 삭제했습니다.` })
    void load(true)
  }

  const askDelete = (p: ExpenseProject) => setConfirm({ kind: p.receipt_count > 0 ? "blocked" : "delete", project: p })
  const askToggle = (p: ExpenseProject) => {
    if (p.status === "active") setConfirm({ kind: "close", project: p })
    else void setStatus(p, "active")
  }

  // ── 화면 ─────────────────────────────────────────────────────────────────
  if (mode === "loading") {
    if (loadError) {
      return (
        <AdminCard className="p-8 text-center">
          <TriangleAlert className="mx-auto h-8 w-8 text-destructive" />
          <p className="mt-3 text-sm font-medium text-dark">프로젝트 목록을 불러오지 못했습니다</p>
          <p className="mt-1 text-sm text-text-secondary">{loadError}</p>
          <Button className="mt-4" variant="outline" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
            다시 시도
          </Button>
        </AdminCard>
      )
    }
    return (
      <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="불러오는 중">
        {[0, 1].map((i) => (
          <div key={i} className="h-64 animate-pulse rounded-xl border border-warm-tan bg-warm-beige/40" />
        ))}
      </div>
    )
  }

  if (navigating) {
    return (
      <AdminCard className="p-10 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-gold" />
        <p className="mt-3 text-base font-semibold text-dark">프로젝트를 등록했습니다!</p>
        <p className="mt-1 text-sm text-text-secondary">이제 영수증을 올릴 차례입니다. 증빙 올리기 화면으로 이동합니다…</p>
      </AdminCard>
    )
  }

  if (mode === "onboarding") {
    return (
      <div className="grid gap-5">
        <div className="rounded-2xl border border-warm-tan bg-card p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold tracking-wide text-gold">사업비 정산 시작하기</p>
          <h2 className="mt-1.5 text-xl font-bold text-dark [word-break:keep-all] md:text-2xl">
            먼저 증빙을 모을 사업(프로젝트)을 등록해 주세요
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary [word-break:keep-all]">
            처음 한 번만 하면 됩니다. 그다음부터는 영수증·카드전표·세금계산서를 올리기만 하면 AI가 내용을 읽어 표로 정리해 드려요.
          </p>
          <ol className="mt-5 grid gap-2 sm:grid-cols-3">
            {[
              { n: 1, t: "프로젝트 등록", d: "지금 단계 · 1분이면 끝나요", now: true },
              { n: 2, t: "증빙 올리기", d: "여러 장을 한 번에 올려도 돼요", now: false },
              { n: 3, t: "확인 후 저장", d: "AI가 채운 표를 보고 프로젝트 선택", now: false },
            ].map((s) => (
              <li
                key={s.n}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                  s.now ? "border-gold bg-gold/10" : "border-warm-tan bg-warm-ivory/60"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    s.now ? "bg-gold text-dark" : "bg-warm-beige text-text-secondary"
                  }`}
                >
                  {s.n}
                </span>
                <span>
                  <span className={`block text-sm font-semibold ${s.now ? "text-dark" : "text-text-secondary"}`}>{s.t}</span>
                  <span className="block text-[11px] text-text-secondary">{s.d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        {projects.length > 0 && createdHere === 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warm-tan bg-warm-beige/40 px-4 py-2.5 text-sm text-text-secondary">
            <span className="[word-break:keep-all]">
              {active.length === 0
                ? `진행 중인 프로젝트가 없습니다. 종료된 프로젝트 ${closed.length}개는 목록에서 ‘재개’할 수 있습니다.`
                : `이미 등록된 프로젝트가 ${projects.length}개 있습니다.`}
            </span>
            <Button variant="outline" size="sm" onClick={leaveOnboarding}>
              등록된 프로젝트 보기
            </Button>
          </div>
        )}

        <div>
          <h3 className="mb-3 text-sm font-semibold text-dark">어떻게 등록할까요?</h3>
          <ProjectAddFlow onCreate={createProject} onFinished={finishOnboarding} existingNames={existingNames} />
        </div>
      </div>
    )
  }

  return (
    <div>
      <NoticeBanner notice={notice} onClose={clearNotice} />

      <StepIntro>
        프로젝트마다 <b className="text-dark">총사업비</b>와 <b className="text-dark">비목별 예산</b>을 넣어 두면, 증빙이 쌓일 때마다
        집행률이 자동으로 계산됩니다. 사업이 끝나면 <b className="text-dark">종료</b>하세요 — 증빙 올리기의 프로젝트 목록에서만 빠지고
        저장된 증빙은 그대로 남습니다.
      </StepIntro>

      {loadError && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          <span>최신 목록을 불러오지 못했습니다. {loadError}</span>
          <Button size="sm" variant="outline" onClick={() => void load(true)}>
            다시 시도
          </Button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          진행 중 <b className="text-dark">{active.length}</b>개
          {closed.length > 0 && (
            <>
              <span className="text-warm-tan">·</span> 종료 <b className="text-dark">{closed.length}</b>개
            </>
          )}
          {refreshing && <Loader2 className="h-3.5 w-3.5 animate-spin text-text-tertiary" aria-label="새로 고치는 중" />}
        </p>
        {!addOpen && (
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            프로젝트 추가
          </Button>
        )}
      </div>

      {addOpen && (
        <AdminCard className="mb-6 border-gold/50">
          <div className="flex items-center justify-between border-b border-warm-tan bg-warm-beige/40 px-5 py-3">
            <h3 className="text-sm font-semibold text-dark">새 프로젝트 추가</h3>
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)} aria-label="추가 닫기">
              <X className="h-4 w-4" />
              닫기
            </Button>
          </div>
          <div className="p-5">
            <ProjectAddFlow key={addKey} onCreate={createProject} onFinished={finishAdd} existingNames={existingNames} />
          </div>
        </AdminCard>
      )}

      {projects.length === 0 && !addOpen && (
        <AdminCard className="px-6 py-12 text-center">
          <FolderPlus className="mx-auto h-10 w-10 text-text-tertiary" />
          <p className="mt-3 text-base font-semibold text-dark">등록된 프로젝트가 없습니다</p>
          <p className="mt-1 text-sm text-text-secondary">프로젝트를 하나 등록하면 바로 증빙을 올릴 수 있습니다.</p>
          <Button className="mt-4" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            프로젝트 추가
          </Button>
        </AdminCard>
      )}

      {active.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {active.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              busy={busyId === p.id}
              onEdit={() => openEdit(p)}
              onToggleStatus={() => askToggle(p)}
              onDelete={() => askDelete(p)}
            />
          ))}
        </div>
      )}
      {active.length === 0 && closed.length > 0 && !addOpen && (
        <div className="rounded-md border border-dashed border-warm-tan px-4 py-6 text-center text-sm text-text-secondary [word-break:keep-all]">
          진행 중인 프로젝트가 없습니다. 새 프로젝트를 추가하거나, 아래 종료된 프로젝트를 ‘재개’하세요.
        </div>
      )}

      {closed.length > 0 && (
        <section className="mt-8">
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-text-secondary hover:text-dark"
            aria-expanded={showClosed}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${showClosed ? "" : "-rotate-90"}`} />
            종료된 프로젝트 {closed.length}개
          </button>
          {showClosed && (
            <div className="grid gap-4 lg:grid-cols-2">
              {closed.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  busy={busyId === p.id}
                  onEdit={() => openEdit(p)}
                  onToggleStatus={() => askToggle(p)}
                  onDelete={() => askDelete(p)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <HelpNote title="집행률은 어떻게 계산되나요?">
        <ul className="list-disc space-y-0.5 pl-4">
          <li>집행액 = 이 프로젝트로 저장된 증빙의 합계 금액(부가세 포함 결제 금액)입니다.</li>
          <li>집행률 = 집행액 ÷ 총사업비. 총사업비를 비워 두면 집행률은 ‘-’로 표시됩니다.</li>
          <li>90%를 넘으면 주황색, 100%를 넘으면 빨간색으로 표시됩니다.</li>
          <li>비목별 집행 현황은 “증빙 내역”에서 프로젝트를 고르면 볼 수 있습니다.</li>
        </ul>
      </HelpNote>

      {/* 수정 Dialog */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && closeEdit()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>프로젝트 수정</DialogTitle>
            <DialogDescription>바꾼 내용은 증빙 올리기·증빙 내역·집행률 계산에 바로 반영됩니다.</DialogDescription>
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
                <p className="rounded-md bg-warm-beige/50 px-3 py-2 text-xs leading-relaxed text-text-secondary [word-break:keep-all]">
                  이 프로젝트에는 증빙이 {editing.receipt_count.toLocaleString("ko-KR")}건 있습니다. 비목 이름을 바꾸면 이미 저장된 증빙의 비목은
                  자동으로 바뀌지 않으니, 필요하면 증빙 내역에서 함께 고쳐 주세요.
                </p>
              )}
              {editError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive [word-break:keep-all]">{editError}</p>
              )}
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit} disabled={editSaving}>
              취소
            </Button>
            <Button onClick={() => void saveEdit()} disabled={editSaving}>
              {editSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  저장 중…
                </>
              ) : (
                "저장"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 종료·삭제 확인 */}
      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          {confirm?.kind === "close" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>‘{confirm.project.name}’ 프로젝트를 종료할까요?</AlertDialogTitle>
                <AlertDialogDescription className="[word-break:keep-all]">
                  종료하면 증빙 올리기 화면의 프로젝트 선택 목록에서 빠집니다. 저장된 증빙과 내역·엑셀 다운로드는 그대로 쓸 수 있고, 언제든
                  ‘재개’로 되돌릴 수 있습니다.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    const p = confirm.project
                    setConfirm(null)
                    void setStatus(p, "closed")
                  }}
                >
                  종료하기
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
          {confirm?.kind === "delete" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>‘{confirm.project.name}’ 프로젝트를 삭제할까요?</AlertDialogTitle>
                <AlertDialogDescription className="[word-break:keep-all]">
                  저장된 증빙이 없는 프로젝트입니다. 삭제하면 되돌릴 수 없습니다. 잘못 만든 프로젝트가 아니라면 ‘종료’를 권합니다.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={() => {
                    const p = confirm.project
                    setConfirm(null)
                    void deleteProject(p)
                  }}
                >
                  삭제
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
          {confirm?.kind === "blocked" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>증빙이 있는 프로젝트는 삭제할 수 없습니다</AlertDialogTitle>
                <AlertDialogDescription className="[word-break:keep-all]">
                  ‘{confirm.project.name}’에는 저장된 증빙이 {confirm.project.receipt_count.toLocaleString("ko-KR")}건 있습니다. 증빙을 지키기 위해
                  삭제 대신 ‘종료’를 사용하세요. 종료하면 증빙 올리기 목록에서만 빠집니다.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>닫기</AlertDialogCancel>
                {confirm.project.status === "active" && (
                  <AlertDialogAction
                    onClick={() => {
                      const p = confirm.project
                      setConfirm(null)
                      void setStatus(p, "closed")
                    }}
                  >
                    대신 종료하기
                  </AlertDialogAction>
                )}
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
