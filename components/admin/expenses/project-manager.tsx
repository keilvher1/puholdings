"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, Loader2, Plus, RefreshCw, X } from "lucide-react"
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
import {
  BusyText,
  EmptyState,
  HelpDetails,
  InlineNotice,
  Panel,
  PanelHeader,
  SectionTitle,
} from "@/components/admin/expenses/ui"
import type { ExpenseProject, ProjectInput } from "@/lib/expenses"

// 사업·프로젝트 화면.
// - 활성 프로젝트가 없거나 ?onboarding=1 로 들어오면 등록 화면(두 가지 등록 방법)을 먼저 보여 준다.
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
      // 화면 모드는 처음 불러올 때 한 번만 정한다(온보딩 중 등록해도 초안 화면이 사라지지 않게)
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
      link: { href: "/admin/expenses", label: "증빙 올리기" },
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
      setEditError("빨간 칸을 확인하세요.")
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
          ? `‘${p.name}’ 프로젝트를 종료했습니다. 저장된 증빙은 유지됩니다.`
          : `‘${p.name}’ 프로젝트를 재개했습니다.`,
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
        <Panel>
          <EmptyState
            title="프로젝트 목록을 불러오지 못했습니다"
            description={loadError}
            action={
              <Button variant="outline" onClick={() => void load()}>
                <RefreshCw className="h-4 w-4" />
                다시 시도
              </Button>
            }
          />
        </Panel>
      )
    }
    return (
      <Panel className="px-4 py-8 text-center" aria-busy="true">
        <BusyText>불러오는 중</BusyText>
      </Panel>
    )
  }

  if (navigating) {
    return (
      <Panel className="px-6 py-10 text-center">
        <p className="text-base font-semibold text-dark">프로젝트 등록 완료</p>
        <BusyText className="mt-2">증빙 올리기로 이동 중</BusyText>
      </Panel>
    )
  }

  if (mode === "onboarding") {
    // 이 화면에서 새로 등록한 프로젝트는 빼고 센다(등록 직후 목록을 다시 불러와도 제목이 바뀌지 않게)
    const prevTotal = Math.max(0, projects.length - createdHere)
    const prevActive = Math.max(0, active.length - createdHere)
    const heading = prevTotal === 0 ? "등록된 프로젝트 없음" : prevActive === 0 ? "진행 중인 프로젝트 없음" : "새 프로젝트"
    return (
      <div className="grid gap-4">
        <div>
          <SectionTitle>{heading}</SectionTitle>
          <p className="mt-1 text-sm text-text-secondary [word-break:keep-all]">
            {prevActive === 0 ? "증빙을 올리려면 사업(프로젝트)을 먼저 등록하세요." : "등록을 마치면 증빙 올리기로 이동합니다."}
          </p>
        </div>

        {projects.length > 0 && createdHere === 0 && (
          <InlineNotice
            action={
              <Button variant="outline" size="sm" onClick={leaveOnboarding}>
                등록된 프로젝트 보기
              </Button>
            }
          >
            {active.length === 0
              ? `진행 중인 프로젝트 없음 · 종료된 프로젝트 ${closed.length}개는 목록에서 재개할 수 있습니다.`
              : `등록된 프로젝트 ${projects.length}개`}
          </InlineNotice>
        )}

        <div>
          <SectionTitle as="h3" className="mb-2 text-sm">
            등록 방법
          </SectionTitle>
          <ProjectAddFlow onCreate={createProject} onFinished={finishOnboarding} existingNames={existingNames} />
        </div>
      </div>
    )
  }

  return (
    <div>
      <NoticeBanner notice={notice} onClose={clearNotice} />

      {loadError && (
        <InlineNotice
          tone="danger"
          className="mb-4"
          action={
            <Button size="sm" variant="outline" onClick={() => void load(true)}>
              다시 시도
            </Button>
          }
        >
          최신 목록을 불러오지 못했습니다. {loadError}
        </InlineNotice>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-3 text-sm text-text-secondary">
          <span>
            진행 중 <b className="font-semibold tabular-nums text-dark">{active.length}</b>개
          </span>
          {closed.length > 0 && (
            <span>
              종료 <b className="font-semibold tabular-nums text-dark">{closed.length}</b>개
            </span>
          )}
          {refreshing && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="새로 고치는 중" />}
        </p>
        {!addOpen && (
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            프로젝트 추가
          </Button>
        )}
      </div>

      {addOpen && (
        <Panel className="mb-6">
          <PanelHeader
            as="h3"
            title="새 프로젝트"
            actions={
              <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)} aria-label="새 프로젝트 닫기">
                <X className="h-4 w-4" />
                닫기
              </Button>
            }
          />
          <div className="p-4">
            <ProjectAddFlow key={addKey} onCreate={createProject} onFinished={finishAdd} existingNames={existingNames} />
          </div>
        </Panel>
      )}

      {projects.length === 0 && !addOpen && (
        <EmptyState
          bordered
          title="등록된 프로젝트 없음"
          description="프로젝트를 등록하면 증빙을 올릴 수 있습니다."
          action={
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              프로젝트 추가
            </Button>
          }
        />
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
        <EmptyState
          bordered
          title="진행 중인 프로젝트 없음"
          description="새 프로젝트를 추가하거나 아래 종료된 프로젝트를 재개하세요."
        />
      )}

      {closed.length > 0 && (
        <section className="mt-8">
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className="mb-3 flex items-center gap-1.5 rounded-sm text-sm font-semibold text-dark outline-none hover:underline hover:underline-offset-2 focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-expanded={showClosed}
          >
            <ChevronDown className={`h-4 w-4 text-text-secondary ${showClosed ? "" : "-rotate-90"}`} aria-hidden />
            종료된 프로젝트
            <span className="font-normal tabular-nums text-text-secondary">{closed.length}개</span>
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

      <HelpDetails
        title="집행률 계산 기준"
        className="mt-6"
        items={[
          "집행액 = 저장된 증빙 합계(부가세 포함)",
          "집행률 = 집행액 ÷ 총사업비(총사업비 미입력 시 ‘-’)",
          "90% 이상 주황 · 100% 초과 빨강",
          "비목별 현황: 증빙 내역 › 프로젝트 선택",
          "종료: 증빙 올리기 목록에서만 제외, 저장된 증빙은 유지",
        ]}
      />

      {/* 수정 Dialog */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && closeEdit()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>프로젝트 수정</DialogTitle>
            <DialogDescription>변경 내용은 즉시 반영됩니다.</DialogDescription>
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
                <InlineNotice className="text-xs">
                  연결된 증빙 <b className="font-semibold tabular-nums">{editing.receipt_count.toLocaleString("ko-KR")}건</b> · 비목 이름 변경은
                  기존 증빙에 반영되지 않습니다.
                </InlineNotice>
              )}
              {editError && <InlineNotice tone="danger">{editError}</InlineNotice>}
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
                <AlertDialogTitle>프로젝트 종료: ‘{confirm.project.name}’</AlertDialogTitle>
                <AlertDialogDescription className="[word-break:keep-all]">
                  증빙 올리기의 프로젝트 선택 목록에서 제외됩니다. 저장된 증빙·내역·엑셀 다운로드는 유지되며 ‘재개’로 되돌릴 수 있습니다.
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
                  종료
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
          {confirm?.kind === "delete" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>프로젝트 삭제: ‘{confirm.project.name}’</AlertDialogTitle>
                <AlertDialogDescription className="[word-break:keep-all]">
                  저장된 증빙이 없는 프로젝트입니다. 삭제 후에는 되돌릴 수 없으니, 잘못 만든 프로젝트가 아니면 ‘종료’를 사용하세요.
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
                  ‘{confirm.project.name}’에 저장된 증빙이 {confirm.project.receipt_count.toLocaleString("ko-KR")}건 있습니다. 삭제 대신
                  ‘종료’를 사용하세요(증빙 올리기 목록에서만 제외).
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
                    종료
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
