// 관리자 콘텐츠 편집 UI를 구동하는 스키마 정의.
// collection별 필드 목록을 선언하면 하나의 범용 CRUD 화면이 모든 콘텐츠를 처리한다.

export type FieldType = "text" | "textarea" | "number" | "image" | "select" | "stringlist"

export interface FieldDef {
  key: string
  label: string
  type: FieldType
  options?: { value: string; label: string }[] // select용
  placeholder?: string
  help?: string
}

export interface CollectionDef {
  collection: string
  label: string // 관리자 탭 이름
  description?: string
  // 목록 테이블에 표시할 필드 key (2~3개)
  listFields: string[]
  fields: FieldDef[]
  // 그룹 필터가 있는 collection(운영도 등)에서 그룹 필드 key
  groupField?: string
}

const TEAM_OPTIONS = [
  { value: "management", label: "경영진" },
  { value: "strategy", label: "전략기획실" },
  { value: "investment", label: "투자사업팀" },
  { value: "incubation", label: "창업보육팀" },
  { value: "venture", label: "벤처파트너" },
]

const CORE_ACTIVITY_GROUPS = [
  { value: "handong", label: "한동대학교" },
  { value: "puholdings", label: "포항연합기술지주" },
  { value: "external", label: "외부 네트워크" },
]

export const COLLECTIONS: CollectionDef[] = [
  {
    collection: "history",
    label: "연혁",
    description: "회사 연혁 타임라인 (연도별로 자동 그룹화)",
    listFields: ["date", "text"],
    fields: [
      { key: "year", label: "연도", type: "number", placeholder: "2026" },
      { key: "date", label: "표기 날짜", type: "text", placeholder: "2026. 03" },
      { key: "text", label: "내용", type: "textarea" },
    ],
  },
  {
    collection: "org_member",
    label: "조직 구성원",
    description: "조직도에 표시되는 팀별 구성원",
    listFields: ["name", "position", "role"],
    groupField: "team",
    fields: [
      { key: "team", label: "소속 팀", type: "select", options: TEAM_OPTIONS },
      { key: "name", label: "이름", type: "text" },
      { key: "position", label: "직위", type: "text", placeholder: "팀장" },
      { key: "role", label: "역할", type: "text", placeholder: "투자 / 외부사업" },
      { key: "details", label: "세부 이력 (한 줄에 하나)", type: "stringlist" },
    ],
  },
  {
    collection: "partner_org",
    label: "유관기관",
    description: "조직 페이지의 지자체·유관기관 협력 목록",
    listFields: ["name"],
    fields: [
      { key: "name", label: "기관명", type: "text" },
      { key: "logo_url", label: "로고", type: "image" },
      { key: "description", label: "설명", type: "textarea" },
    ],
  },
  {
    collection: "core_activity",
    label: "운영도 · 활동",
    description: "핵심 기능/역할 다이어그램의 활동 항목",
    listFields: ["group", "text"],
    groupField: "group",
    fields: [
      { key: "group", label: "구분", type: "select", options: CORE_ACTIVITY_GROUPS },
      { key: "text", label: "활동", type: "text" },
    ],
  },
]

export const SETTINGS: {
  key: string
  label: string
  fields: FieldDef[]
}[] = [
  {
    key: "hero",
    label: "메인 히어로",
    fields: [
      { key: "label", label: "상단 라벨", type: "text" },
      { key: "title", label: "제목 (줄바꿈 가능)", type: "textarea" },
      { key: "subtitle", label: "부제", type: "textarea" },
    ],
  },
  {
    key: "contact",
    label: "연락처 (하단·문의 공용)",
    fields: [
      { key: "address", label: "주소", type: "text" },
      { key: "phone", label: "전화", type: "text" },
    ],
  },
  {
    key: "core_functions_intro",
    label: "운영도 소개 문단",
    fields: [{ key: "paragraphs", label: "문단 (한 줄에 하나)", type: "stringlist" }],
  },
]

export function getCollectionDef(collection: string): CollectionDef | undefined {
  return COLLECTIONS.find((c) => c.collection === collection)
}
