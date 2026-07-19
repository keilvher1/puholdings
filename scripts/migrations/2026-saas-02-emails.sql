-- 2026-saas-02-emails.sql
-- 메일 발송 인프라: 템플릿(email_templates) + 발송 로그(email_logs) + 기본 템플릿 8종 시드

CREATE TABLE IF NOT EXISTS email_templates (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  subject VARCHAR(300) NOT NULL,
  body_html TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_logs (
  id SERIAL PRIMARY KEY,
  to_email VARCHAR(255) NOT NULL,
  tenant_id INT REFERENCES tenants(id) ON DELETE SET NULL,
  template_code VARCHAR(50),
  subject VARCHAR(300),
  body_html TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  provider_id VARCHAR(100),
  error TEXT,
  related_type VARCHAR(50),
  related_id INT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT email_logs_status_check CHECK (status IN ('queued', 'sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_tenant ON email_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs (status);

-- ---------- 기본 템플릿 시드 ----------

INSERT INTO email_templates (code, name, subject, body_html) VALUES (
  'tenant_welcome',
  '입주기업 포털 계정 안내',
  '[포항연합기술지주] {{tenant_name}} 입주기업 포털 계정 안내',
  '<div style="max-width:600px;margin:0 auto;padding:32px 24px;font-family:sans-serif;color:#333;background:#ffffff;">
  <h2 style="margin:0 0 20px;color:#1a1a2e;border-bottom:2px solid #c9a227;padding-bottom:12px;font-size:20px;">입주기업 포털 계정 안내</h2>
  <p style="line-height:1.7;">{{tenant_name}} 담당자님, 안녕하세요.<br>포항연합기술지주 창업보육센터입니다.</p>
  <p style="line-height:1.7;">입주기업 포털 계정이 발급되었습니다. 아래 정보로 로그인해 주세요.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;width:130px;font-weight:bold;">로그인 이메일</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;">{{email}}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;font-weight:bold;">임시 비밀번호</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;font-family:monospace;font-weight:bold;">{{temp_password}}</td>
    </tr>
  </table>
  <p style="margin:24px 0;"><a href="{{portal_url}}" style="display:inline-block;background:#1a1a2e;color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:4px;font-size:14px;">입주기업 포털 로그인</a></p>
  <p style="line-height:1.7;font-size:13px;color:#777;">보안을 위해 최초 로그인 시 비밀번호 변경이 필요합니다.</p>
  <p style="margin-top:28px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#999;">본 메일은 발신 전용입니다. 문의사항은 포항연합기술지주 창업보육센터로 연락해 주세요.</p>
</div>'
) ON CONFLICT (code) DO NOTHING;

INSERT INTO email_templates (code, name, subject, body_html) VALUES (
  'bill_issued',
  '청구서 발행 안내',
  '[포항연합기술지주] {{bill_month}} 청구서 발행 안내',
  '<div style="max-width:600px;margin:0 auto;padding:32px 24px;font-family:sans-serif;color:#333;background:#ffffff;">
  <h2 style="margin:0 0 20px;color:#1a1a2e;border-bottom:2px solid #c9a227;padding-bottom:12px;font-size:20px;">{{bill_month}} 청구서 발행 안내</h2>
  <p style="line-height:1.7;">{{tenant_name}} 담당자님, 안녕하세요.<br>포항연합기술지주 창업보육센터입니다.</p>
  <p style="line-height:1.7;">{{bill_month}} 청구서가 발행되었습니다. 상세 내역은 포털에서 확인해 주세요.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;width:130px;font-weight:bold;">청구 월</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;">{{bill_month}}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;font-weight:bold;">청구 금액</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;font-weight:bold;">{{amount}}원</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;font-weight:bold;">납부 기한</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;">{{due_date}}</td>
    </tr>
  </table>
  <p style="margin:24px 0;"><a href="{{portal_url}}" style="display:inline-block;background:#1a1a2e;color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:4px;font-size:14px;">청구서 확인하기</a></p>
  <p style="margin-top:28px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#999;">본 메일은 발신 전용입니다. 문의사항은 포항연합기술지주 창업보육센터로 연락해 주세요.</p>
</div>'
) ON CONFLICT (code) DO NOTHING;

INSERT INTO email_templates (code, name, subject, body_html) VALUES (
  'bill_reminder',
  '납부 기한 안내',
  '[포항연합기술지주] {{bill_month}} 청구서 납부 기한 안내',
  '<div style="max-width:600px;margin:0 auto;padding:32px 24px;font-family:sans-serif;color:#333;background:#ffffff;">
  <h2 style="margin:0 0 20px;color:#1a1a2e;border-bottom:2px solid #c9a227;padding-bottom:12px;font-size:20px;">{{bill_month}} 청구서 납부 기한 안내</h2>
  <p style="line-height:1.7;">{{tenant_name}} 담당자님, 안녕하세요.<br>포항연합기술지주 창업보육센터입니다.</p>
  <p style="line-height:1.7;">{{bill_month}} 청구서가 아직 납부 확인되지 않아 안내드립니다. 이미 납부하셨다면 이 메일은 무시하셔도 됩니다.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;width:130px;font-weight:bold;">청구 월</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;">{{bill_month}}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;font-weight:bold;">미납 금액</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;font-weight:bold;color:#b42318;">{{amount}}원</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;font-weight:bold;">납부 기한</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;">{{due_date}}</td>
    </tr>
  </table>
  <p style="margin:24px 0;"><a href="{{portal_url}}" style="display:inline-block;background:#1a1a2e;color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:4px;font-size:14px;">청구서 확인하기</a></p>
  <p style="margin-top:28px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#999;">본 메일은 발신 전용입니다. 문의사항은 포항연합기술지주 창업보육센터로 연락해 주세요.</p>
</div>'
) ON CONFLICT (code) DO NOTHING;

INSERT INTO email_templates (code, name, subject, body_html) VALUES (
  'program_notice',
  '프로그램 안내',
  '[포항연합기술지주] 프로그램 안내: {{program_name}}',
  '<div style="max-width:600px;margin:0 auto;padding:32px 24px;font-family:sans-serif;color:#333;background:#ffffff;">
  <h2 style="margin:0 0 20px;color:#1a1a2e;border-bottom:2px solid #c9a227;padding-bottom:12px;font-size:20px;">프로그램 안내</h2>
  <p style="line-height:1.7;">{{tenant_name}} 담당자님, 안녕하세요.<br>포항연합기술지주 창업보육센터입니다.</p>
  <p style="line-height:1.7;">입주기업 대상 프로그램을 안내드립니다. 참여를 원하시면 기한 내 포털에서 신청해 주세요.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;width:130px;font-weight:bold;">프로그램명</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;font-weight:bold;">{{program_name}}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;font-weight:bold;">운영 기간</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;">{{program_period}}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;font-weight:bold;">신청 마감</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;">{{apply_due}}</td>
    </tr>
  </table>
  <p style="margin:24px 0;"><a href="{{portal_url}}" style="display:inline-block;background:#1a1a2e;color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:4px;font-size:14px;">자세히 보기 / 신청하기</a></p>
  <p style="margin-top:28px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#999;">본 메일은 발신 전용입니다. 문의사항은 포항연합기술지주 창업보육센터로 연락해 주세요.</p>
</div>'
) ON CONFLICT (code) DO NOTHING;

INSERT INTO email_templates (code, name, subject, body_html) VALUES (
  'application_result',
  '프로그램 신청 결과 안내',
  '[포항연합기술지주] {{program_name}} 신청 결과 안내',
  '<div style="max-width:600px;margin:0 auto;padding:32px 24px;font-family:sans-serif;color:#333;background:#ffffff;">
  <h2 style="margin:0 0 20px;color:#1a1a2e;border-bottom:2px solid #c9a227;padding-bottom:12px;font-size:20px;">프로그램 신청 결과 안내</h2>
  <p style="line-height:1.7;">{{tenant_name}} 담당자님, 안녕하세요.<br>포항연합기술지주 창업보육센터입니다.</p>
  <p style="line-height:1.7;">신청하신 프로그램의 결과를 안내드립니다.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;width:130px;font-weight:bold;">프로그램명</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;">{{program_name}}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;font-weight:bold;">결과</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;font-weight:bold;">{{result}}</td>
    </tr>
  </table>
  <p style="line-height:1.7;">{{note}}</p>
  <p style="margin:24px 0;"><a href="{{portal_url}}" style="display:inline-block;background:#1a1a2e;color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:4px;font-size:14px;">포털에서 확인하기</a></p>
  <p style="margin-top:28px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#999;">본 메일은 발신 전용입니다. 문의사항은 포항연합기술지주 창업보육센터로 연락해 주세요.</p>
</div>'
) ON CONFLICT (code) DO NOTHING;

INSERT INTO email_templates (code, name, subject, body_html) VALUES (
  'submission_reminder',
  '자료 제출 요청',
  '[포항연합기술지주] 자료 제출 요청: {{submission_name}} (기한 {{due_date}})',
  '<div style="max-width:600px;margin:0 auto;padding:32px 24px;font-family:sans-serif;color:#333;background:#ffffff;">
  <h2 style="margin:0 0 20px;color:#1a1a2e;border-bottom:2px solid #c9a227;padding-bottom:12px;font-size:20px;">자료 제출 요청</h2>
  <p style="line-height:1.7;">{{tenant_name}} 담당자님, 안녕하세요.<br>포항연합기술지주 창업보육센터입니다.</p>
  <p style="line-height:1.7;">아래 자료의 제출 기한이 다가와 안내드립니다. 기한 내 포털을 통해 제출해 주세요.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;width:130px;font-weight:bold;">제출 자료</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;font-weight:bold;">{{submission_name}}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;font-weight:bold;">제출 기한</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;color:#b42318;font-weight:bold;">{{due_date}}</td>
    </tr>
  </table>
  <p style="margin:24px 0;"><a href="{{portal_url}}" style="display:inline-block;background:#1a1a2e;color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:4px;font-size:14px;">포털에서 제출하기</a></p>
  <p style="margin-top:28px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#999;">본 메일은 발신 전용입니다. 문의사항은 포항연합기술지주 창업보육센터로 연락해 주세요.</p>
</div>'
) ON CONFLICT (code) DO NOTHING;

INSERT INTO email_templates (code, name, subject, body_html) VALUES (
  'submission_feedback',
  '제출 자료 검토 결과',
  '[포항연합기술지주] {{submission_name}} 검토 결과 안내',
  '<div style="max-width:600px;margin:0 auto;padding:32px 24px;font-family:sans-serif;color:#333;background:#ffffff;">
  <h2 style="margin:0 0 20px;color:#1a1a2e;border-bottom:2px solid #c9a227;padding-bottom:12px;font-size:20px;">제출 자료 검토 결과 안내</h2>
  <p style="line-height:1.7;">{{tenant_name}} 담당자님, 안녕하세요.<br>포항연합기술지주 창업보육센터입니다.</p>
  <p style="line-height:1.7;">제출해 주신 자료의 검토 결과를 안내드립니다.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;width:130px;font-weight:bold;">제출 자료</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;">{{submission_name}}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;font-weight:bold;vertical-align:top;">검토 의견</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;line-height:1.7;">{{feedback}}</td>
    </tr>
  </table>
  <p style="margin:24px 0;"><a href="{{portal_url}}" style="display:inline-block;background:#1a1a2e;color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:4px;font-size:14px;">포털에서 확인하기</a></p>
  <p style="margin-top:28px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#999;">본 메일은 발신 전용입니다. 문의사항은 포항연합기술지주 창업보육센터로 연락해 주세요.</p>
</div>'
) ON CONFLICT (code) DO NOTHING;

INSERT INTO email_templates (code, name, subject, body_html) VALUES (
  'inquiry_received',
  '홈페이지 문의 접수 알림 (관리자용)',
  '[홈페이지 문의] {{name}}님의 새 문의가 접수되었습니다',
  '<div style="max-width:600px;margin:0 auto;padding:32px 24px;font-family:sans-serif;color:#333;background:#ffffff;">
  <h2 style="margin:0 0 20px;color:#1a1a2e;border-bottom:2px solid #c9a227;padding-bottom:12px;font-size:20px;">새 문의 접수</h2>
  <p style="line-height:1.7;">홈페이지를 통해 새 문의가 접수되었습니다.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;width:130px;font-weight:bold;">이름</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;">{{name}}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;font-weight:bold;">이메일</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;">{{email}}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;font-weight:bold;">연락처</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;">{{phone}}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;font-weight:bold;">회사</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;">{{company}}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;font-weight:bold;">접수 시각</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;">{{received_at}}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;background:#faf8f3;font-weight:bold;vertical-align:top;">문의 내용</td>
      <td style="padding:10px 14px;border:1px solid #e8e2d6;line-height:1.7;white-space:pre-line;">{{message}}</td>
    </tr>
  </table>
  <p style="margin-top:28px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#999;">관리자 페이지의 문의 관리에서 전체 내역을 확인할 수 있습니다.</p>
</div>'
) ON CONFLICT (code) DO NOTHING;
