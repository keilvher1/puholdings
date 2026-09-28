// 데스크톱 앱(포연기 증빙함) 설치 파일 조회.
// 설치 파일은 비공개 Blob `desktop/{버전}/puholdings-receipts-{버전}-{플랫폼}.{확장자}`에 둔다.
// 저장소가 비공개 전용이라 공개 링크가 없으므로, 관리자 세션을 확인한 라우트가 스트리밍으로 내려준다.
// 새 버전은 같은 규칙의 경로로 올리기만 하면 가장 높은 버전이 자동으로 선택된다.

import { list } from "@vercel/blob"

export const DESKTOP_PLATFORMS = ["mac-arm64", "mac-x64", "win"] as const
export type DesktopPlatform = (typeof DESKTOP_PLATFORMS)[number]

export const DESKTOP_PLATFORM_INFO: Record<
  DesktopPlatform,
  { label: string; note: string; match: RegExp; downloadName: (version: string) => string }
> = {
  "mac-arm64": {
    label: "맥 (Apple 칩)",
    note: "M1 이후 · dmg",
    match: /-mac-arm64\.dmg$/,
    downloadName: (v) => `포연기증빙함-${v}-맥-애플실리콘.dmg`,
  },
  "mac-x64": {
    label: "맥 (Intel)",
    note: "Intel 맥 · dmg",
    match: /-mac-x64\.dmg$/,
    downloadName: (v) => `포연기증빙함-${v}-맥-인텔.dmg`,
  },
  win: {
    label: "윈도우",
    note: "Windows 10·11 64비트 · exe",
    match: /-win-x64-setup\.exe$/,
    downloadName: (v) => `포연기증빙함-${v}-윈도우-설치.exe`,
  },
}

export interface DesktopRelease {
  platform: DesktopPlatform
  version: string
  pathname: string
  size: number
  uploadedAt: string
}

const VERSION_RE = /^desktop\/(\d+)\.(\d+)\.(\d+)\//

function versionParts(pathname: string): [number, number, number] | null {
  const m = VERSION_RE.exec(pathname)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

function compareVersion(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

// 플랫폼별 최신 설치 파일. 조회 실패는 호출한 쪽에서 처리한다.
export async function listDesktopReleases(): Promise<Partial<Record<DesktopPlatform, DesktopRelease>>> {
  const out: Partial<Record<DesktopPlatform, DesktopRelease & { parts: [number, number, number] }>> = {}
  let cursor: string | undefined
  do {
    const page = await list({ prefix: "desktop/", cursor, limit: 1000 })
    for (const blob of page.blobs) {
      const parts = versionParts(blob.pathname)
      if (!parts) continue
      for (const platform of DESKTOP_PLATFORMS) {
        if (!DESKTOP_PLATFORM_INFO[platform].match.test(blob.pathname)) continue
        const current = out[platform]
        if (!current || compareVersion(parts, current.parts) > 0) {
          out[platform] = {
            platform,
            version: parts.join("."),
            pathname: blob.pathname,
            size: blob.size,
            uploadedAt: new Date(blob.uploadedAt).toISOString(),
            parts,
          }
        }
      }
    }
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)

  const result: Partial<Record<DesktopPlatform, DesktopRelease>> = {}
  for (const platform of DESKTOP_PLATFORMS) {
    const r = out[platform]
    if (r) result[platform] = { platform, version: r.version, pathname: r.pathname, size: r.size, uploadedAt: r.uploadedAt }
  }
  return result
}

export function formatFileSize(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`
}
