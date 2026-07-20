import { Resend } from "resend"
import { getDb } from "./db"

// 메일 발송 단일 진입점. 직접 Resend API를 호출하는 코드를 흩뿌리지 말고
// 반드시 이 파일의 sendMail / sendBatch를 사용한다.
//
// 설계 원칙:
// - 실패해도 throw하지 않는다 (호출부의 본 작업을 깨지 않기 위해). { success: false } 반환.
// - 모든 발송 시도는 성공/실패와 무관하게 email_logs에 기록한다.
// - RESEND_API_KEY 미설정 시 발송을 스킵하고 failed 로그를 남긴다 (로컬/프리뷰 환경 대응).

export interface MailRelated {
  type: string
  id: number
}

export interface SendMailOptions {
  to: string
  templateCode: string
  vars?: Record<string, string | number | null | undefined>
  tenantId?: number | null
  related?: MailRelated
  // 템플릿 없이 제목/본문을 직접 지정 (관리자 수동 발송, 재발송용).
  // 지정 시에도 vars의 {{key}} 치환은 동일하게 적용된다.
  overrides?: { subject: string; html: string }
  // 여기 나열된 변수는 email_logs에 저장되는 본문에서 ********로 마스킹된다
  // (임시 비밀번호 등 민감 값이 DB 로그에 평문으로 남지 않도록).
  redactVarsInLog?: string[]
  // 여기 나열된 변수는 HTML 이스케이프 없이 본문에 삽입된다.
  // 사용자 입력이 아닌, 서버 코드가 직접 조립한 HTML에만 사용할 것.
  rawHtmlVars?: string[]
  // 첨부파일 (청구서 PDF 등). content는 Buffer 또는 base64 문자열.
  attachments?: { filename: string; content: Buffer | string }[]
}

export interface SendMailResult {
  success: boolean
  error?: string
  logId?: number
  providerId?: string
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

// {{key}} 치환. 누락 변수는 빈 문자열 + console.warn.
// escape=true(본문): HTML 이스케이프 후 삽입. escape=false(제목): 제목은 평문이므로
// 이스케이프하지 않고 헤더 인젝션 방지를 위해 개행만 제거한다.
function renderTemplate(
  text: string,
  vars: Record<string, string | number | null | undefined>,
  context: string,
  escape = true,
  rawKeys?: Set<string>
): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const value = vars[key]
    if (value === undefined || value === null) {
      console.warn(`[mail] 템플릿 변수 누락: {{${key}}} (${context})`)
      return ""
    }
    const str = String(value)
    // rawKeys: 서버가 직접 조립한 신뢰된 HTML 조각(예: 청구 내역 표)은 이스케이프 없이 삽입
    if (rawKeys?.has(key)) return str
    return escape ? escapeHtml(str) : str.replace(/[\r\n]+/g, " ")
  })
}

interface LogEntry {
  to: string
  tenantId: number | null
  templateCode: string
  subject: string
  bodyHtml: string
  status: "sent" | "failed"
  providerId?: string | null
  error?: string | null
  related?: MailRelated
}

async function writeLog(entry: LogEntry): Promise<number | undefined> {
  const sql = getDb()
  if (!sql) return undefined
  try {
    const rows = await sql`
      INSERT INTO email_logs (to_email, tenant_id, template_code, subject, body_html, status, provider_id, error, related_type, related_id, sent_at)
      VALUES (
        ${entry.to},
        ${entry.tenantId},
        ${entry.templateCode},
        ${entry.subject},
        ${entry.bodyHtml},
        ${entry.status},
        ${entry.providerId || null},
        ${entry.error || null},
        ${entry.related?.type || null},
        ${entry.related?.id || null},
        ${entry.status === "sent" ? new Date().toISOString() : null}
      )
      RETURNING id
    `
    return rows[0]?.id
  } catch (error) {
    console.error("[mail] email_logs 기록 실패:", error)
    return undefined
  }
}

async function loadTemplate(code: string): Promise<{ subject: string; body_html: string } | null> {
  const sql = getDb()
  if (!sql) return null
  try {
    const rows = await sql`SELECT subject, body_html FROM email_templates WHERE code = ${code}`
    return rows.length > 0 ? { subject: rows[0].subject, body_html: rows[0].body_html } : null
  } catch (error) {
    console.error("[mail] 템플릿 조회 실패:", error)
    return null
  }
}

function getMailEnv(): { resend: Resend; from: string } | { error: string } {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { error: "RESEND_API_KEY not set" }
  const from = process.env.MAIL_FROM
  if (!from) return { error: "MAIL_FROM not set" }
  return { resend: new Resend(apiKey), from }
}

export async function sendMail(options: SendMailOptions): Promise<SendMailResult> {
  const { to, templateCode, vars = {}, tenantId = null, related, overrides, redactVarsInLog, rawHtmlVars, attachments } = options
  const rawKeys = rawHtmlVars ? new Set(rawHtmlVars) : undefined

  try {
    // 1. 제목/본문 결정 (템플릿 로드 또는 overrides)
    let rawSubject: string
    let rawHtml: string
    if (overrides) {
      rawSubject = overrides.subject
      rawHtml = overrides.html
    } else {
      const template = await loadTemplate(templateCode)
      if (!template) {
        const error = `템플릿을 찾을 수 없습니다: ${templateCode}`
        console.error(`[mail] ${error}`)
        const logId = await writeLog({
          to, tenantId, templateCode, subject: "", bodyHtml: "", status: "failed", error, related,
        })
        return { success: false, error, logId }
      }
      rawSubject = template.subject
      rawHtml = template.body_html
    }

    // 2. {{key}} 치환 (로그 저장용은 민감 변수 마스킹)
    const context = `${templateCode} → ${to}`
    const subject = renderTemplate(rawSubject, vars, context, false)
    const html = renderTemplate(rawHtml, vars, context, true, rawKeys)
    let logSubject = subject
    let logHtml = html
    if (redactVarsInLog && redactVarsInLog.length > 0) {
      const redacted = { ...vars }
      for (const key of redactVarsInLog) {
        if (key in redacted) redacted[key] = "********"
      }
      logSubject = renderTemplate(rawSubject, redacted, context, false)
      logHtml = renderTemplate(rawHtml, redacted, context, true, rawKeys)
    }

    // 3. 환경 확인 (미설정 시 스킵 + failed 로그)
    const env = getMailEnv()
    if ("error" in env) {
      console.warn(`[mail] 발송 스킵 (${env.error}): ${templateCode} → ${to}`)
      const logId = await writeLog({
        to, tenantId, templateCode, subject: logSubject, bodyHtml: logHtml, status: "failed", error: env.error, related,
      })
      return { success: false, error: env.error, logId }
    }

    // 4. 발송
    const { data, error } = await env.resend.emails.send({
      from: env.from, to, subject, html,
      ...(attachments && attachments.length > 0
        ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })) }
        : {}),
    })
    if (error) {
      console.error(`[mail] 발송 실패: ${templateCode} → ${to}:`, error)
      const logId = await writeLog({
        to, tenantId, templateCode, subject: logSubject, bodyHtml: logHtml, status: "failed", error: error.message, related,
      })
      return { success: false, error: error.message, logId }
    }

    const logId = await writeLog({
      to, tenantId, templateCode, subject: logSubject, bodyHtml: logHtml, status: "sent", providerId: data?.id, related,
    })
    return { success: true, logId, providerId: data?.id }
  } catch (error) {
    // 어떤 경우에도 호출부로 throw하지 않는다
    const message = error instanceof Error ? error.message : "알 수 없는 오류"
    console.error(`[mail] 발송 중 예외: ${templateCode} → ${to}:`, error)
    const logId = await writeLog({
      to, tenantId, templateCode, subject: "", bodyHtml: "", status: "failed", error: message, related,
    })
    return { success: false, error: message, logId }
  }
}

export interface BatchRecipient {
  to: string
  tenantId?: number | null
  vars?: Record<string, string | number | null | undefined>
  related?: MailRelated
}

export interface SendBatchResult {
  success: boolean
  sent: number
  failed: number
  error?: string
}

const BATCH_CHUNK_SIZE = 100

// Resend batch API로 동일 템플릿을 여러 수신자에게 발송 (100건 단위 chunk).
export async function sendBatch(
  recipients: BatchRecipient[],
  templateCode: string,
  overrides?: { subject: string; html: string },
  options?: { rawHtmlVars?: string[] }
): Promise<SendBatchResult> {
  if (recipients.length === 0) return { success: true, sent: 0, failed: 0 }
  const rawKeys = options?.rawHtmlVars ? new Set(options.rawHtmlVars) : undefined

  try {
    let rawSubject: string
    let rawHtml: string
    if (overrides) {
      rawSubject = overrides.subject
      rawHtml = overrides.html
    } else {
      const template = await loadTemplate(templateCode)
      if (!template) {
        const error = `템플릿을 찾을 수 없습니다: ${templateCode}`
        for (const r of recipients) {
          await writeLog({
            to: r.to, tenantId: r.tenantId ?? null, templateCode, subject: "", bodyHtml: "", status: "failed", error, related: r.related,
          })
        }
        return { success: false, sent: 0, failed: recipients.length, error }
      }
      rawSubject = template.subject
      rawHtml = template.body_html
    }

    // 수신자별 렌더링
    const rendered = recipients.map((r) => ({
      ...r,
      subject: renderTemplate(rawSubject, r.vars ?? {}, `${templateCode} → ${r.to}`, false),
      html: renderTemplate(rawHtml, r.vars ?? {}, `${templateCode} → ${r.to}`, true, rawKeys),
    }))

    const env = getMailEnv()
    if ("error" in env) {
      console.warn(`[mail] 일괄 발송 스킵 (${env.error}): ${templateCode}, ${recipients.length}건`)
      for (const r of rendered) {
        await writeLog({
          to: r.to, tenantId: r.tenantId ?? null, templateCode, subject: r.subject, bodyHtml: r.html, status: "failed", error: env.error, related: r.related,
        })
      }
      return { success: false, sent: 0, failed: recipients.length, error: env.error }
    }

    let sent = 0
    let failed = 0

    for (let i = 0; i < rendered.length; i += BATCH_CHUNK_SIZE) {
      const chunk = rendered.slice(i, i + BATCH_CHUNK_SIZE)
      try {
        const { data, error } = await env.resend.batch.send(
          chunk.map((r) => ({ from: env.from, to: r.to, subject: r.subject, html: r.html }))
        )
        if (error) {
          for (const r of chunk) {
            await writeLog({
              to: r.to, tenantId: r.tenantId ?? null, templateCode, subject: r.subject, bodyHtml: r.html, status: "failed", error: error.message, related: r.related,
            })
          }
          failed += chunk.length
          continue
        }
        const ids: Array<{ id: string }> = data?.data ?? []
        for (let j = 0; j < chunk.length; j++) {
          const r = chunk[j]
          await writeLog({
            to: r.to, tenantId: r.tenantId ?? null, templateCode, subject: r.subject, bodyHtml: r.html, status: "sent", providerId: ids[j]?.id, related: r.related,
          })
        }
        sent += chunk.length
      } catch (error) {
        const message = error instanceof Error ? error.message : "알 수 없는 오류"
        console.error(`[mail] 일괄 발송 chunk 실패 (${templateCode}):`, error)
        for (const r of chunk) {
          await writeLog({
            to: r.to, tenantId: r.tenantId ?? null, templateCode, subject: r.subject, bodyHtml: r.html, status: "failed", error: message, related: r.related,
          })
        }
        failed += chunk.length
      }
    }

    return { success: failed === 0, sent, failed }
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류"
    console.error(`[mail] 일괄 발송 중 예외 (${templateCode}):`, error)
    // "모든 시도는 기록된다" 불변식 유지: 예외 경로에서도 수신자별 failed 로그를 남긴다
    for (const r of recipients) {
      await writeLog({
        to: r.to, tenantId: r.tenantId ?? null, templateCode, subject: "", bodyHtml: "", status: "failed", error: message, related: r.related,
      })
    }
    return { success: false, sent: 0, failed: recipients.length, error: message }
  }
}
