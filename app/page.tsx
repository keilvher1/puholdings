import type { Metadata, Viewport } from "next"
import { HomePage } from "@/components/home/home-page"

// 메타 정보도 리뉴얼 시안과 같게 맞춘다(주소만 이 사이트 기준 — layout의 metadataBase로 절대 URL이 된다).
const TITLE = "포항연합기술지주 | 경북 포항 유일 공공형 액셀러레이터"
const OG_IMAGE = { url: "/home/og-main.jpg", alt: "포항연합기술지주 — 지역의 가능성을 발굴하고, 투자로 성장을 연결합니다." }

export const metadata: Metadata = {
  title: TITLE,
  description:
    "지역의 가능성을 발굴하고, 투자로 성장을 연결합니다. 대학과 지역의 창업기업을 위한 기업 발굴·초기투자·보육·후속 성장 지원.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%2309162b'/%3E%3Cpath d='M8 25V7h9a6 6 0 010 12h-5v6zm4-10h5a2 2 0 000-4h-5' fill='%2353d8ed'/%3E%3C/svg%3E",
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "포항연합기술지주",
    title: TITLE,
    description:
      "지역의 가능성을 발굴하고, 투자로 성장을 연결합니다. 대학과 지역 창업기업의 발굴부터 초기투자·보육·후속 성장까지 함께합니다.",
    url: "/",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "포항연합기술지주 | 공공형 액셀러레이터",
    description: "기업 발굴 · 초기투자 · 보육 · 후속 성장",
    images: [OG_IMAGE.url],
  },
}

// 시안에는 theme-color가 없다(휴대폰 브라우저 상단 바가 기본색). 레이아웃의 값을 홈에서만 지운다.
export const viewport: Viewport = { themeColor: null }

export default function Home() {
  return <HomePage />
}
