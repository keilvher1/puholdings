// 사내 메신저(잔디 벤치마킹) 공용 타입·상수. 서버(API)와 클라이언트(화면) 양쪽에서 import한다.
// 서버 전용 모듈을 import하지 않는다.
//
// 구성원: 관리자 계정(admins) = 정회원(member), 입주기업 포털 계정(tenant_users) = 게스트(guest).
// 게스트는 초대받은 토픽·대화방만 보고, 공개 토픽 둘러보기·토픽 생성·멤버 초대를 할 수 없다.
// 데이터 범위는 "방 참여(messenger_room_members)"로만 정한다 — 요청 파라미터로 남의 방을 볼 수 없다.

export type MemberKind = "admin" | "tenant"
export type MemberRole = "member" | "guest"

export interface MessengerMember {
  id: number
  kind: MemberKind
  role: MemberRole
  display_name: string
  title: string // 직함·소속(예: "운영팀 매니저", 게스트는 회사명)
  status_text: string // 상태 메시지
  away: boolean // 자리 비움
  avatar_color: string // 이니셜 아바타 배경색(#hex)
  last_seen_at: string | null // ISO
}

export type RoomKind = "topic" | "dm"

export interface MessengerRoom {
  id: number
  kind: RoomKind
  name: string // 토픽 이름. DM은 상대 이름을 화면에서 조합(서버는 '' 가능)
  description: string
  is_private: boolean // 토픽만 의미 있음(DM은 항상 비공개)
  is_archived: boolean
  created_by: number | null
  created_at: string
  member_ids: number[]
  announcement: MessengerMessage | null // 공지로 고정된 메시지
  // 내 설정·상태
  starred: boolean
  muted: boolean
  last_read_message_id: number | null
  unread_count: number
  mention_count: number // 안 읽은 메시지 중 나를 멘션한 수
  last_message: MessengerMessage | null
  webhook_count?: number
}

export type MessageKind = "text" | "file" | "poll" | "todo" | "system"

export interface MessengerAttachment {
  name: string
  pathname: string // Blob private: messenger/{room_id}/{timestamp}-{name}
  size: number
  type: string
  width?: number | null
  height?: number | null
}

export interface ReactionSummary {
  emoji: string
  count: number
  member_ids: number[]
}

export interface MessengerPoll {
  id: number
  question: string
  options: string[]
  multiple: boolean
  anonymous: boolean
  closes_at: string | null
  closed: boolean
  counts: number[] // 선택지별 득표수
  voter_count: number
  my_votes: number[] // 내가 고른 선택지 index
  voters?: { option: number; member_ids: number[] }[] // 익명이면 없음
}

export interface MessengerTodo {
  id: number
  room_id: number
  message_id: number | null
  title: string
  assignee_ids: number[]
  due_date: string | null // 'YYYY-MM-DD'
  done: boolean
  done_by: number | null
  done_at: string | null
  created_by: number
  created_at: string
}

export interface MessengerMessage {
  id: number
  room_id: number
  author_id: number | null // 시스템·웹훅 메시지는 null
  author_label: string // 웹훅·시스템 발신자 이름(사람이면 '')
  kind: MessageKind
  body: string // 본문(간단 마크다운: **굵게**, `코드`, [링크](url), 줄바꿈)
  attachments: MessengerAttachment[]
  connect_color: string // 커넥트(웹훅) 첨부 영역 색 '' 가능
  connect_info: { title: string; description: string }[] // 커넥트 첨부 블록
  mentions: number[] // 멘션한 멤버 id, @전체는 [-1]
  parent_id: number | null // 댓글이면 원본 메시지 id
  reply_count: number
  last_reply_at: string | null
  shared_from: { message_id: number; room_name: string; author_name: string } | null
  reactions: ReactionSummary[]
  bookmarked: boolean // 내가 별표했는지
  unread_by: number // 이 메시지를 아직 읽지 않은 참여자 수(작성자 제외)
  poll: MessengerPoll | null
  todo: MessengerTodo | null
  edited_at: string | null
  deleted: boolean // 삭제되면 body·attachments 비움
  created_at: string
}

// GET /api/messenger/bootstrap
export interface BootstrapResponse {
  success: true
  me: MessengerMember
  members: MessengerMember[] // 내가 볼 수 있는 멤버(게스트는 같은 방 참여자만)
  rooms: MessengerRoom[]
  cursor: number // 이후 /sync에 넘길 이벤트 커서
}

// GET /api/messenger/sync?cursor=N — 내가 참여한 방의 변경 이벤트
export type MessengerEvent =
  | { id: number; type: "message.created" | "message.updated"; room_id: number; message: MessengerMessage }
  | { id: number; type: "message.deleted"; room_id: number; message_id: number }
  | { id: number; type: "room.updated"; room_id: number; room: MessengerRoom }
  | { id: number; type: "room.removed"; room_id: number } // 내가 나가거나 강퇴·삭제
  | { id: number; type: "read"; room_id: number; member_id: number; last_read_message_id: number }
  | { id: number; type: "member.updated"; member: MessengerMember }
  | { id: number; type: "todo.updated"; room_id: number; todo: MessengerTodo }

export interface SyncResponse {
  success: true
  events: MessengerEvent[]
  cursor: number
  reset?: boolean // 커서가 너무 오래돼 다시 bootstrap해야 함
}

export type MessengerErrorResponse = { success: false; error: string }

// 폴링 주기(ms)
export const SYNC_INTERVAL_VISIBLE = 2000
export const SYNC_INTERVAL_HIDDEN = 15000

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "✅", "👀"] as const

export const MAX_MESSAGE_LENGTH = 5000
export const MAX_ATTACHMENTS_PER_MESSAGE = 10
export const MESSENGER_MAX_FILE_BYTES = 20 * 1024 * 1024 // 20MB(요청 본문 4.5MB 제한 때문에 업로드는 Blob 클라이언트 업로드 또는 4MB 이하 서버 업로드)

export const AVATAR_COLORS = ["#2563eb", "#0891b2", "#059669", "#65a30d", "#d97706", "#dc2626", "#db2777", "#7c3aed", "#475569"] as const

// 멘션 토큰: 본문에는 '@[이름](m:ID)' 형태로 저장, @전체는 '@[전체](m:all)'
export const MENTION_RE = /@\[([^\]]{1,60})\]\(m:(\d+|all)\)/g
