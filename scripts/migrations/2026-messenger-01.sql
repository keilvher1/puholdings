-- 2026-messenger-01.sql
-- 사내 메신저(잔디 벤치마킹): 구성원·방(토픽/대화)·메시지·반응·별표·투표·할 일·동기화 이벤트·웹훅.
-- 관리자 계정(admins) = 정회원(member), 입주기업 포털 계정(tenant_users) = 게스트(guest).
-- 데이터 범위는 messenger_room_members(방 참여)로만 정한다.
-- 멱등: 여러 번 실행해도 결과가 같다.

CREATE TABLE IF NOT EXISTS messenger_members (
  id SERIAL PRIMARY KEY,
  kind VARCHAR(10) NOT NULL,
  admin_id INT NULL,
  tenant_user_id INT NULL,
  role VARCHAR(10) NOT NULL,
  display_name VARCHAR(80) NOT NULL DEFAULT '',
  title VARCHAR(120) NOT NULL DEFAULT '',
  status_text VARCHAR(120) NOT NULL DEFAULT '',
  away BOOLEAN NOT NULL DEFAULT false,
  avatar_color VARCHAR(9) NOT NULL DEFAULT '#475569',
  last_seen_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT messenger_members_kind_check CHECK (kind IN ('admin', 'tenant')),
  CONSTRAINT messenger_members_role_check CHECK (role IN ('member', 'guest')),
  CONSTRAINT messenger_members_admin_id_key UNIQUE (admin_id),
  CONSTRAINT messenger_members_tenant_user_id_key UNIQUE (tenant_user_id),
  CONSTRAINT messenger_members_owner_check CHECK (
    (kind = 'admin' AND admin_id IS NOT NULL) OR (kind = 'tenant' AND tenant_user_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS messenger_rooms (
  id SERIAL PRIMARY KEY,
  kind VARCHAR(10) NOT NULL,
  name VARCHAR(80) NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  is_private BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  dm_key TEXT NULL,                          -- DM 구성원 id 정렬 문자열(중복 DM 방지)
  announcement_message_id BIGINT NULL,       -- 공지로 고정한 메시지
  system_slug VARCHAR(40) NULL,              -- 시스템 알림 토픽 식별('alerts')
  created_by INT NULL REFERENCES messenger_members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT messenger_rooms_kind_check CHECK (kind IN ('topic', 'dm')),
  CONSTRAINT messenger_rooms_dm_key_key UNIQUE (dm_key),
  CONSTRAINT messenger_rooms_system_slug_key UNIQUE (system_slug)
);

CREATE TABLE IF NOT EXISTS messenger_room_members (
  room_id INT NOT NULL REFERENCES messenger_rooms(id) ON DELETE CASCADE,
  member_id INT NOT NULL REFERENCES messenger_members(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL DEFAULT 'member',
  starred BOOLEAN NOT NULL DEFAULT false,
  muted BOOLEAN NOT NULL DEFAULT false,
  last_read_message_id BIGINT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, member_id),
  CONSTRAINT messenger_room_members_role_check CHECK (role IN ('admin', 'member'))
);
CREATE INDEX IF NOT EXISTS idx_messenger_room_members_member ON messenger_room_members (member_id);

CREATE TABLE IF NOT EXISTS messenger_messages (
  id BIGSERIAL PRIMARY KEY,
  room_id INT NOT NULL REFERENCES messenger_rooms(id) ON DELETE CASCADE,
  author_id INT NULL REFERENCES messenger_members(id),
  author_label VARCHAR(80) NOT NULL DEFAULT '',
  kind VARCHAR(10) NOT NULL DEFAULT 'text',
  body TEXT NOT NULL DEFAULT '',
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  connect_color VARCHAR(9) NOT NULL DEFAULT '',
  connect_info JSONB NOT NULL DEFAULT '[]'::jsonb,
  mentions JSONB NOT NULL DEFAULT '[]'::jsonb,
  parent_id BIGINT NULL REFERENCES messenger_messages(id),
  shared_from_id BIGINT NULL,
  edited_at TIMESTAMPTZ NULL,
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT messenger_messages_kind_check CHECK (kind IN ('text', 'file', 'poll', 'todo', 'system'))
);
CREATE INDEX IF NOT EXISTS idx_messenger_messages_room ON messenger_messages (room_id, id);
CREATE INDEX IF NOT EXISTS idx_messenger_messages_parent ON messenger_messages (parent_id);
CREATE INDEX IF NOT EXISTS idx_messenger_messages_author ON messenger_messages (author_id);

CREATE TABLE IF NOT EXISTS messenger_reactions (
  message_id BIGINT NOT NULL REFERENCES messenger_messages(id) ON DELETE CASCADE,
  member_id INT NOT NULL REFERENCES messenger_members(id) ON DELETE CASCADE,
  emoji VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, member_id, emoji)
);

CREATE TABLE IF NOT EXISTS messenger_bookmarks (
  member_id INT NOT NULL REFERENCES messenger_members(id) ON DELETE CASCADE,
  message_id BIGINT NOT NULL REFERENCES messenger_messages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, message_id)
);

CREATE TABLE IF NOT EXISTS messenger_polls (
  id SERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES messenger_messages(id) ON DELETE CASCADE,
  question TEXT NOT NULL DEFAULT '',
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  multiple BOOLEAN NOT NULL DEFAULT false,
  anonymous BOOLEAN NOT NULL DEFAULT false,
  closes_at TIMESTAMPTZ NULL,
  closed BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT messenger_polls_message_id_key UNIQUE (message_id)
);

CREATE TABLE IF NOT EXISTS messenger_poll_votes (
  poll_id INT NOT NULL REFERENCES messenger_polls(id) ON DELETE CASCADE,
  member_id INT NOT NULL REFERENCES messenger_members(id) ON DELETE CASCADE,
  option_index INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, member_id, option_index)
);

CREATE TABLE IF NOT EXISTS messenger_todos (
  id SERIAL PRIMARY KEY,
  room_id INT NOT NULL REFERENCES messenger_rooms(id) ON DELETE CASCADE,
  message_id BIGINT NULL REFERENCES messenger_messages(id) ON DELETE SET NULL,
  title VARCHAR(300) NOT NULL DEFAULT '',
  assignee_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  due_date DATE NULL,
  done_at TIMESTAMPTZ NULL,
  done_by INT NULL,
  created_by INT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messenger_todos_room ON messenger_todos (room_id);
CREATE INDEX IF NOT EXISTS idx_messenger_todos_message ON messenger_todos (message_id);

-- 동기화용 변경 로그. member_id가 있으면 그 구성원에게만 보이는 이벤트(내 설정 변경, 방에서 빠짐 등).
-- 7일 지난 행은 정리한다(sync에서 정리된 커서면 reset:true).
CREATE TABLE IF NOT EXISTS messenger_events (
  id BIGSERIAL PRIMARY KEY,
  room_id INT NULL,
  member_id INT NULL,
  type VARCHAR(30) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messenger_events_room ON messenger_events (room_id, id);
CREATE INDEX IF NOT EXISTS idx_messenger_events_member ON messenger_events (member_id, id);
CREATE INDEX IF NOT EXISTS idx_messenger_events_created ON messenger_events (created_at);

CREATE TABLE IF NOT EXISTS messenger_webhooks (
  id SERIAL PRIMARY KEY,
  room_id INT NOT NULL REFERENCES messenger_rooms(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL DEFAULT '',
  token VARCHAR(64) NOT NULL,
  created_by INT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NULL,
  CONSTRAINT messenger_webhooks_token_key UNIQUE (token)
);
CREATE INDEX IF NOT EXISTS idx_messenger_webhooks_room ON messenger_webhooks (room_id);
