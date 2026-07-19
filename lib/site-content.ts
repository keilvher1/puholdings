import { getDb } from "./db"

// 공개 페이지 콘텐츠 관리. site_content(키-값 싱글턴) + content_items(collection별 리스트).
// 공개 페이지는 DB 우선, 실패/미시드 시 컴포넌트의 하드코딩 기본값으로 폴백한다(FALLBACK_* 패턴과 동일).

export interface ContentItem<T = Record<string, unknown>> {
  id: number
  sort_order: number
  is_active: boolean
  data: T
}

// 싱글턴 텍스트 (hero, contact 등)
export async function getSiteContent<T = Record<string, unknown>>(
  key: string
): Promise<T | null> {
  const sql = getDb()
  if (!sql) return null
  try {
    const rows = await sql`SELECT value FROM site_content WHERE key = ${key}`
    return (rows[0]?.value as T) ?? null
  } catch (error) {
    console.error(`[site-content] ${key} 조회 실패:`, error)
    return null
  }
}

// collection 리스트 (활성 항목만, 정렬순)
export async function getContentItems<T = Record<string, unknown>>(
  collection: string
): Promise<ContentItem<T>[]> {
  const sql = getDb()
  if (!sql) return []
  try {
    const rows = await sql`
      SELECT id, sort_order, is_active, data
      FROM content_items
      WHERE collection = ${collection} AND is_active = TRUE
      ORDER BY sort_order, id
    `
    return rows as unknown as ContentItem<T>[]
  } catch (error) {
    console.error(`[site-content] ${collection} 목록 조회 실패:`, error)
    return []
  }
}
