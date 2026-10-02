"use client"

// 포털 계정 묶음(기업 카드 "연락처·포털" 탭, 계획서 4.3.8).
//   없을 때: 만들기 전 안내 3줄(메일 문구는 isMailEnabled() 값 그대로) + 로그인 이메일·담당자 이름 + [포털 계정 만들기]
//   만든 뒤: 포털 주소·로그인 이메일·임시 비밀번호([보기]) + [안내문 복사] + [닫기](처음 누르면 "전달했나요?" 확인)
//   있을 때: 로그인 이메일 · 마지막 로그인(또는 아직 로그인 안 함) + ⋯ [비밀번호 다시 발급] → 확인(이메일이 바뀌면 본문에 명시)
// 보안 패턴은 그대로다: 임시 비밀번호는 발급 응답에서 한 번만 받아 이 화면 상태에만 두고(저장·로그 없음),
// 첫 로그인 변경 강제·다른 기업 이메일 중복 차단은 서버(lib/auth.ts createTenantUser)가 한다.
// 발급 결과(issued)는 탭을 옮겨도 사라지지 않게 부르는 쪽(기업 카드)이 들고 있는다.

import { useEffect, useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FieldError } from "@/components/ui/field"
import { BusyButton, CopyButton, Notice, RowActions, Section, useConfirm } from "@/components/saas"
import { dateTime, relative } from "@/lib/format"
import { friendlyError, MSG } from "@/lib/messages"
import { accountNoticeText, emailError, type TenantRow } from "@/lib/tenant-model"

export interface IssuedAccount {
  tenantId: number
  email: string
  password: string
  mailSent: boolean
  kind: "new" | "reissue"
}

export function PortalAccountPanel({
  tenant,
  mailEnabled,
  issued,
  onIssued,
  onDismissIssued,
}: {
  tenant: TenantRow
  mailEnabled: boolean
  issued: IssuedAccount | null
  onIssued: (result: IssuedAccount) => void
  onDismissIssued: () => void
}) {
  const ask = useConfirm()
  const hasAccount = !!tenant.account_id
  const [reissuing, setReissuing] = useState(false)
  const [email, setEmail] = useState(tenant.account_email || tenant.contact_email || tenant.tax_email || "")
  const [name, setName] = useState(tenant.manager_name || tenant.ceo_name || "")
  const [busy, setBusy] = useState(false)
  const [emailErr, setEmailErr] = useState("")
  const [error, setError] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [portalUrl, setPortalUrl] = useState("/portal/login")

  useEffect(() => {
    setPortalUrl(`${window.location.origin}/portal/login`)
  }, [])

  // 다른 기업으로 바뀌면 입력값을 새로 채운다
  useEffect(() => {
    setEmail(tenant.account_email || tenant.contact_email || tenant.tax_email || "")
    setName(tenant.manager_name || tenant.ceo_name || "")
    setReissuing(false)
    setEmailErr("")
    setError("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.id])

  const issue = async (kind: "new" | "reissue") => {
    if (busy) return
    setError("")
    const err = !email.trim() ? "로그인 이메일을 입력해 주세요" : emailError(email, "로그인 이메일")
    if (err) {
      setEmailErr(err)
      requestAnimationFrame(() => document.getElementById("acct-email")?.focus())
      return
    }
    setEmailErr("")
    if (kind === "reissue") {
      const before = tenant.account_email ?? ""
      const changed = before && before.trim().toLowerCase() !== email.trim().toLowerCase()
      const ok = await ask({
        title: `‘${tenant.name}’의 포털 비밀번호를 새로 만들까요?`,
        body: "지금 비밀번호로는 더 이상 로그인할 수 없어요.",
        consequences: [
          ...(changed ? [`로그인 이메일도 ${before} → ${email.trim()}로 바뀌어요`] : []),
          "새 임시 비밀번호는 다음 화면에서 한 번만 보여요",
        ],
        confirmLabel: "비밀번호 다시 발급하기",
      })
      if (!ok) return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}/account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), name: name.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setShowPw(false)
        setReissuing(false)
        onIssued({ tenantId: tenant.id, email: data.email, password: data.temp_password, mailSent: data.mail_sent === true, kind })
      } else {
        setError(friendlyError(res.status, data.error, "포털 계정을 만들지 못했어요."))
      }
    } catch {
      setError(friendlyError(0, null, "포털 계정을 만들지 못했어요."))
    } finally {
      setBusy(false)
    }
  }

  const closeIssued = async () => {
    const ok = await ask({
      title: "안내문을 전달했나요?",
      body: "닫으면 임시 비밀번호를 다시 볼 수 없어요. 잊었다면 비밀번호를 다시 발급해야 해요.",
      confirmLabel: "전달했어요, 닫기",
      cancelLabel: "계속 보기",
    })
    if (ok) onDismissIssued()
  }

  // ── 발급 결과 ──
  if (issued && issued.tenantId === tenant.id) {
    const notice = accountNoticeText({ tenantName: tenant.name, portalUrl, email: issued.email, password: issued.password })
    return (
      <Section title="포털 계정" headingLevel={3}>
        <div className="space-y-3">
          <Notice tone="success" title={issued.kind === "new" ? "포털 계정을 만들었어요" : "비밀번호를 새로 만들었어요"}>
            임시 비밀번호는 지금 한 번만 보여요. 안내문을 복사해 전달해 주세요.
          </Notice>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base">
            <dt className="text-[#5f6070]">포털 주소</dt>
            <dd className="min-w-0 break-all">{portalUrl}</dd>
            <dt className="text-[#5f6070]">로그인 이메일</dt>
            <dd className="min-w-0 break-all">{issued.email}</dd>
            <dt className="text-[#5f6070]">임시 비밀번호</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <span className="font-mono tabular-nums" aria-live="polite">
                {showPw ? issued.password : "••••••••"}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="hover:bg-warm-beige hover:text-dark"
                aria-pressed={showPw}
                onClick={() => setShowPw((v) => !v)}
              >
                {showPw ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                {showPw ? "가리기" : "보기"}
              </Button>
            </dd>
          </dl>
          <p className="text-sm text-text-secondary">입주기업이 처음 로그인하면 비밀번호를 새로 정해요.</p>
          {issued.mailSent ? (
            <p className="text-sm text-text-secondary">로그인 이메일로 안내 메일을 보냈어요.</p>
          ) : mailEnabled ? (
            <Notice tone="warning">안내 메일을 보내지 못했어요. 안내문을 복사해 직접 전달해 주세요.</Notice>
          ) : (
            <p className="text-sm text-text-secondary">메일 발송이 설정되지 않아 안내문을 직접 전달해야 해요.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton value={notice} label="안내문 복사" variant="default" successMessage="안내문을 복사했어요" />
            <Button type="button" variant="outline" className="hover:bg-warm-beige hover:text-dark" onClick={() => void closeIssued()}>
              닫기
            </Button>
          </div>
        </div>
      </Section>
    )
  }

  const form = (kind: "new" | "reissue") => (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="acct-email" className="text-base font-medium text-dark">
          로그인 이메일 <span className="text-text-secondary">(필수)</span>
        </Label>
        <Input
          id="acct-email"
          type="email"
          inputMode="email"
          autoComplete="off"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (emailErr) setEmailErr("")
          }}
          aria-invalid={emailErr ? true : undefined}
          aria-describedby={emailErr ? "acct-email-error" : "acct-email-hint"}
          className="h-10 bg-card text-base"
        />
        {emailErr ? (
          <FieldError id="acct-email-error">{emailErr}</FieldError>
        ) : (
          <p id="acct-email-hint" className="text-sm text-text-secondary">
            {kind === "new" ? "담당자 메일로 미리 채웠어요. 다른 기업 계정이 쓰는 메일은 쓸 수 없어요" : "바꾸면 로그인 이메일도 바뀌어요"}
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="acct-name" className="text-base font-medium text-dark">
          담당자 이름
        </Label>
        <Input id="acct-name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} className="h-10 bg-card text-base" />
      </div>
      {error && (
        <Notice tone="danger" title="포털 계정을 만들지 못했어요">
          {error}
        </Notice>
      )}
    </div>
  )

  // ── 계정 없음 ──
  if (!hasAccount) {
    return (
      <Section title="포털 계정" headingLevel={3} description="아직 포털 계정이 없어요">
        <div className="space-y-4">
          <div className="rounded-md border border-warm-tan bg-warm-ivory px-4 py-3">
            <p className="font-medium text-dark">만들기 전에 확인해 주세요</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[15px] leading-relaxed text-dark [word-break:keep-all]">
              <li>임시 비밀번호는 다음 화면에서 한 번만 보여요</li>
              <li>입주기업이 처음 로그인하면 비밀번호를 새로 정해요</li>
              <li>
                안내 메일:{" "}
                {mailEnabled ? "로그인 이메일로 안내 메일이 가요" : "메일 발송이 설정되지 않아 안내문을 직접 전달해야 해요"}
              </li>
            </ul>
          </div>
          {form("new")}
          <BusyButton type="button" busy={busy} busyLabel="만드는 중…" onClick={() => void issue("new")}>
            포털 계정 만들기
          </BusyButton>
        </div>
      </Section>
    )
  }

  // ── 계정 있음 ──
  const last = tenant.account_last_login
  return (
    <Section
      title="포털 계정"
      headingLevel={3}
      actions={
        !reissuing ? (
          <RowActions
            label={tenant.name}
            triggerLabel={`${tenant.name} 포털 계정 동작 더 보기`}
            items={[{ label: "비밀번호 다시 발급", onSelect: () => setReissuing(true) }]}
          />
        ) : undefined
      }
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base">
          <dt className="text-[#5f6070]">로그인 이메일</dt>
          <dd className="min-w-0 break-all">{tenant.account_email}</dd>
          <dt className="text-[#5f6070]">로그인</dt>
          <dd>
            {last ? (
              <span title={dateTime(last)}>발급 · 마지막 로그인 {relative(last)}</span>
            ) : (
              "발급 · 아직 로그인 안 함"
            )}
          </dd>
        </dl>
        {reissuing && (
          <div className="space-y-4 rounded-md border border-warm-tan px-4 py-3">
            <p className="font-medium text-dark">비밀번호 다시 발급</p>
            {form("reissue")}
            <div className="flex flex-wrap gap-2">
              <BusyButton type="button" busy={busy} busyLabel={MSG.busy} onClick={() => void issue("reissue")}>
                비밀번호 다시 발급하기
              </BusyButton>
              <Button
                type="button"
                variant="outline"
                className="hover:bg-warm-beige hover:text-dark"
                disabled={busy}
                onClick={() => {
                  setReissuing(false)
                  setError("")
                  setEmailErr("")
                  setEmail(tenant.account_email || "")
                }}
              >
                닫기
              </Button>
            </div>
          </div>
        )}
      </div>
    </Section>
  )
}
