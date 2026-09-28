// 브라우저 전용: 업로드 전에 사진을 줄여 전송량·AI 비용·대기 시간을 줄인다.
// - 긴 변 2000px 이하 JPEG(품질 0.85)로 다시 그린다(작으면 키우지 않는다).
// - 휴대폰 사진의 EXIF 회전은 createImageBitmap(imageOrientation:"from-image")로 반영한다.
// - HEIC 등 브라우저가 읽지 못하는 형식은 ClientImageError(한국어 안내)로 알린다.
// 서버 전용 모듈을 import하지 않는다(클라이언트 컴포넌트에서만 사용).

export const CLIENT_IMAGE_MAX_SIDE = 2000
export const CLIENT_IMAGE_QUALITY = 0.85

export class ClientImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ClientImageError"
  }
}

const HEIC_RE = /\.(heic|heif)$/i

export function isHeicLike(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || HEIC_RE.test(file.name)
}

// 이름만 보고 이미지로 취급할 확장자(일부 OS는 type을 비워서 보낸다)
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif|tiff?)$/i

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || (!file.type && IMAGE_EXT_RE.test(file.name))
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || (!file.type && /\.pdf$/i.test(file.name))
}

// 사람이 읽는 파일 크기(1.2MB, 340KB)
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0KB"
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function decodeFailedMessage(file: File): string {
  if (isHeicLike(file)) {
    return "아이폰 HEIC 사진은 이 브라우저에서 열 수 없습니다. 아이폰 설정 › 카메라 › 포맷을 '높은 호환성'으로 바꾸거나, 사진을 JPG로 저장해 다시 올려 주세요."
  }
  return "이미지를 열 수 없습니다. 파일이 손상되었거나 지원하지 않는 형식입니다. JPG·PNG로 저장해 다시 올려 주세요."
}

interface Decoded {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

async function decodeWithBitmap(file: Blob): Promise<Decoded> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
}

// createImageBitmap이 없거나(구형 사파리) 실패할 때의 대안. <img>는 EXIF 회전을 기본 적용한다.
function decodeWithImageElement(file: Blob): Promise<Decoded> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.decoding = "async"
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("decode failed"))
    }
    img.src = url
  })
}

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      return await decodeWithBitmap(file)
    } catch {
      // 아래 <img> 경로로 한 번 더 시도
    }
  }
  try {
    return await decodeWithImageElement(file)
  } catch {
    throw new ClientImageError(decodeFailedMessage(file))
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ClientImageError("사진을 변환하지 못했습니다. 다시 시도해 주세요."))),
      "image/jpeg",
      quality
    )
  })
}

function jpegName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "") || "photo"
  return `${base}.jpg`
}

export interface CompressOptions {
  maxSide?: number
  quality?: number
}

/**
 * 사진을 긴 변 maxSide(기본 2000px) 이하 JPEG로 줄인다.
 * - 이미 JPEG이고 줄일 필요가 없으며 다시 인코딩해도 작아지지 않으면 원본을 그대로 돌려준다.
 * - 투명 배경(PNG)은 흰 배경으로 채운다(JPEG에는 투명도가 없어 검게 변하는 것을 막는다).
 * - 읽을 수 없는 형식이면 ClientImageError를 던진다(message는 화면에 그대로 보여 줄 한국어 안내).
 */
export async function compressImage(file: File, options: CompressOptions = {}): Promise<File> {
  const maxSide = options.maxSide ?? CLIENT_IMAGE_MAX_SIDE
  const quality = options.quality ?? CLIENT_IMAGE_QUALITY

  const decoded = await decode(file)
  try {
    const { width, height } = decoded
    if (!width || !height) throw new ClientImageError(decodeFailedMessage(file))

    const scale = Math.min(1, maxSide / Math.max(width, height))
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new ClientImageError("이 브라우저에서는 사진을 줄일 수 없습니다. 최신 크롬·사파리·엣지에서 다시 시도해 주세요.")
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, w, h)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(decoded.source, 0, 0, w, h)

    const blob = await canvasToJpeg(canvas, quality)
    // 메모리 해제(모바일 사파리는 캔버스 메모리 한도가 빡빡하다)
    canvas.width = 0
    canvas.height = 0

    if (scale === 1 && file.type === "image/jpeg" && blob.size >= file.size) return file
    return new File([blob], jpegName(file.name), { type: "image/jpeg", lastModified: Date.now() })
  } finally {
    decoded.release()
  }
}

/**
 * 원본 파일의 SHA-256(hex). 사진은 브라우저마다 다시 인코딩 결과가 달라지므로, 같은 사진을
 * 다른 기기·브라우저에서 올려도 같은 파일로 알아보려면 줄이기 전 원본의 해시가 필요하다.
 * 보안 컨텍스트(https·localhost)가 아니거나 읽기에 실패하면 null(서버가 전송본 해시를 대신 쓴다).
 */
export async function sha256File(file: Blob): Promise<string | null> {
  try {
    const subtle = globalThis.crypto?.subtle
    if (!subtle) return null
    const digest = await subtle.digest("SHA-256", await file.arrayBuffer())
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
  } catch {
    return null
  }
}
